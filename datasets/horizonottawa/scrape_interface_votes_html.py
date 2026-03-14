#!/usr/bin/env python3
"""Scrape rows from a saved Airtable shared page HTML export or an Airtable URL."""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

INIT_DATA_RE = re.compile(r"window\.initData\s*=\s*(\{[\s\S]*?\})\s*</script>", re.IGNORECASE)

DEFAULT_COLUMNS = {
    1: "date",
    2: "vote",
    3: "motion",
    4: "ward",
    5: "meeting_link",
    6: "result",
    7: "vote_tally",
}

try:
    from playwright.sync_api import sync_playwright
except Exception:  # pragma: no cover - optional dependency
    sync_playwright = None


def _row_fingerprint(row: dict[str, Any]) -> str:
    row_key = row.get("_airtable_row_key")
    if isinstance(row_key, str) and row_key:
        return f"key:{row_key}"

    parts: list[str] = []
    row_index = row.get("_airtable_row_index")
    if row_index is not None:
        parts.append(f"idx:{row_index}")

    for key in sorted(row.keys()):
        if key.startswith("_airtable_row_"):
            continue
        value = row.get(key)
        if value not in (None, ""):
            parts.append(f"{key}:{value}")
    return "|".join(parts) if parts else str(id(row))


def _safe_output_name(value: str) -> str:
    value = html.unescape(value).strip()
    if not value:
        return "councillor"

    value = re.sub(r"[\\/:*?\"<>|]", "", value)
    value = re.sub(r"\s+", "-", value).strip("-")
    value = re.sub(r"[^A-Za-z0-9._-]", "", value)
    value = value.encode("ascii", "ignore").decode("ascii")
    value = value.strip("._-")
    return value or "councillor"


def _normalise_tab_name(raw_name: str, index: int) -> str:
    cleaned = re.sub(r"\s*\(\s*\d+\s*\)\s*$", "", raw_name or "").strip()
    normalised = _safe_output_name(cleaned or f"councillor_{index}")
    return normalised


def _is_councillor_label_candidate(value: str) -> bool:
    cleaned = _normalise_text(value)
    if not cleaned:
        return False
    lowered = cleaned.lower()
    if lowered in {"tab", "tabs", "view", "views", "grid", "table", "all", "records"}:
        return False
    if len(cleaned) < 2:
        return False
    return True


def _dedupe_rows(found_rows: list[dict[str, Any]], seen: set[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for row in found_rows:
        if not isinstance(row, dict):
            continue
        fingerprint = _row_fingerprint(row)
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        rows.append(row)
    return rows


def _extract_tab_name(tab: Any, fallback: str) -> str:
    extract_script = """
    (el) => {
      const candidates = [];
      const seen = new Set();
      const push = (value) => {
        if (!value) {
          return;
        }
        const text = (value || "")
          .replace(/\\u200b/g, "")
          .replace(/\\s+/g, " ")
          .trim();
        if (!text || seen.has(text)) {
          return;
        }
        seen.add(text);
        candidates.push(text);
      };

      const attrs = [
        "aria-label",
        "title",
        "alt",
        "name",
        "label",
        "data-name",
        "data-tab-name",
        "data-label",
      ];
      for (const attr of attrs) {
        push(el.getAttribute(attr));
      }

      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        for (const id of labelledBy.split(/\\s+/)) {
          if (!id) {
            continue;
          }
          const labelled = document.getElementById(id);
          if (labelled) {
            push(labelled.textContent || "");
          }
        }
      }

      const textContainers = [
        ".tab-label",
        "[role='tab']",
        "[role='button']",
        "[data-testid*='tab']",
        "button",
        "a",
        "span",
        "div",
      ];

      for (const node of [el, ...Array.from(el.querySelectorAll(textContainers.join(",")))]) {
        for (const attr of attrs) {
          push(node.getAttribute && node.getAttribute(attr));
        }
        const candidateText = (node.textContent || "").trim();
        if (candidateText) {
          push(candidateText);
        }
        push(node.innerText || "");
      }

      return candidates;
    }
    """

    try:
        candidates = tab.evaluate(extract_script)
        if isinstance(candidates, list):
            for candidate in candidates:
                if isinstance(candidate, str):
                    cleaned = _normalise_text(candidate)
                    if _is_councillor_label_candidate(cleaned):
                        return cleaned
    except Exception:
        pass

    for read in (lambda: tab.inner_text(timeout=1000), lambda: tab.text_content(timeout=1000)):
        try:
            text = read()
            if isinstance(text, str) and text.strip():
                cleaned = _normalise_text(text.strip())
                if _is_councillor_label_candidate(cleaned):
                    return cleaned
        except Exception:
            pass

    for attr in ("aria-label", "title", "data-name", "data-tab-name"):
        try:
            value = tab.get_attribute(attr)
            if isinstance(value, str) and value.strip():
                cleaned = _normalise_text(value)
                if _is_councillor_label_candidate(cleaned):
                    return cleaned
        except Exception:
            continue

    return fallback


def _collect_current_tab_rows(page: Any, wait_ms: int) -> list[dict[str, Any]]:
    reset_script = """
    () => {
        const rowSelector = '[role=\"row\"][aria-rowindex], [data-row-id], [data-record-id]';
        const hasRows = (node) => {
            if (!(node instanceof HTMLElement) || !node.querySelector) {
                return false;
            }
            return !!node.querySelector(rowSelector);
        };
        const isScrollable = (node) => {
            if (!(node instanceof HTMLElement)) {
                return false;
            }
            const style = window.getComputedStyle(node);
            const overflowY = (style.overflowY || '').toLowerCase();
            return node.scrollHeight > node.clientHeight + 24 && (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay');
        };
        const add = (set, node) => {
            if (node instanceof HTMLElement) {
                set.add(node);
            }
        };

        const candidates = new Set();

        const activeTab = Array.from(document.querySelectorAll('[role=\"tab\"][aria-selected=\"true\"]')).find(Boolean)
            || Array.from(document.querySelectorAll('[role=\"tab\"]')).find(Boolean);
        if (activeTab) {
            const controlled = activeTab.getAttribute('aria-controls');
            if (controlled) {
                add(candidates, document.getElementById(controlled));
            }
            const panel = activeTab.closest('[role=\"tabpanel\"]');
            if (panel) {
                add(candidates, panel);
            }
        }

        const scrollRoots = [];
        for (const rowNode of Array.from(document.querySelectorAll(rowSelector))) {
            if (!(rowNode instanceof HTMLElement)) {
                continue;
            }
            let current = rowNode.parentElement;
            for (let depth = 0; current && current !== document.body && depth < 8; depth += 1) {
                scrollRoots.push(current);
                if (current instanceof HTMLElement && current.scrollHeight > current.clientHeight + 24) {
                    add(candidates, current);
                }
                current = current.parentElement;
            }
        }

        const genericSelectors = [
            '[role=\"grid\"]',
            '[role=\"table\"]',
            '[data-testid=\"grid-body\"]',
            '[data-testid=\"table-body\"]',
            '.airtable-grid-body',
            '.antiscroll-inner',
            '.scrollOverlay',
            '.scroll-area',
            '[data-testid*=\"virtual\"]',
            '[data-testid*=\"grid\"]'
        ];
        for (const selector of genericSelectors) {
            for (const node of Array.from(document.querySelectorAll(selector))) {
                if (node instanceof HTMLElement) {
                    add(candidates, node);
                    if (node.scrollHeight > node.clientHeight + 24) {
                        add(candidates, node);
                    }
                }
            }
        }

        for (const node of Array.from(document.querySelectorAll('*'))) {
            if (!hasRows(node) && !isScrollable(node)) {
                continue;
            }
            add(candidates, node);
        }

        const valid = Array.from(candidates).filter(isScrollable).filter((el) => isScrollable(el) || hasRows(el));
        for (const container of valid) {
            container.scrollTop = 0;
            container.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
        window.scrollTo(0, 0);
        window.dispatchEvent(new Event('scroll'));
        window.__councillorScraperScrollTargets = valid;
        return valid.length;
    }
    """

    seen: set[str] = set()
    rows: list[dict[str, Any]] = []

    try:
        page.evaluate(reset_script)
        page.wait_for_timeout(max(250, int(wait_ms / 4)))
    except Exception:
        pass

    collected = _extract_rows_from_page(page)
    rows.extend(_dedupe_rows(collected, seen))

    unchanged = 0
    unchanged_scroll = 0
    previous_len = len(rows)
    for _ in range(120):
        scrolled = _scroll_table_once(page)
        if not scrolled:
            unchanged_scroll += 1
        else:
            unchanged_scroll = 0
        page.wait_for_timeout(wait_ms)
        collected = _extract_rows_from_page(page)
        added = _dedupe_rows(collected, seen)
        rows.extend(added)
        if len(rows) == previous_len:
            unchanged += 1
            if unchanged >= 7 or (not scrolled and unchanged >= 3) or unchanged_scroll >= 4:
                break
        else:
            unchanged = 0
            previous_len = len(rows)

    return rows


def _find_more_tab_button(page: Any) -> Any | None:
    candidates = []

    try:
        exact = page.get_by_role("button", name=re.compile(r"^\s*more\s*$", re.IGNORECASE))
        candidates.extend(exact.all())
    except Exception:
        pass

    # Airtable "More" sometimes surfaces as aria-label only and no accessible role label.
    try:
        labelled = page.locator('[role="button"][aria-label]')
        for idx in range(labelled.count()):
            element = labelled.nth(idx)
            try:
                if not element.is_visible():
                    continue
                label = element.get_attribute("aria-label")
                if label and label.strip().lower() == "more":
                    candidates.append(element)
            except Exception:
                continue
    except Exception:
        pass

    # General contains-search fallback.
    try:
        contains_more = page.locator('[role="button"]').filter(has_text=re.compile(r"\bmore\b", re.IGNORECASE))
        for idx in range(contains_more.count()):
            candidates.append(contains_more.nth(idx))
    except Exception:
        pass
    try:
        for selector in ('[aria-label="More"]', '[title="More"]', '.more', '[data-testid*="more"]'):
            for idx in range(page.locator(selector).count()):
                candidates.append(page.locator(selector).nth(idx))
    except Exception:
        pass

    seen: set[str] = set()
    for candidate in candidates:
        try:
            if not candidate.is_visible():
                continue
            outer_text = candidate.inner_text(timeout=500)
        except Exception:
            continue
        text = _normalise_text(outer_text).lower()
        if text != "more":
            continue
        key = str(candidate)
        if key in seen:
            continue
        seen.add(key)
        return candidate

    return None


def _open_more_tabs_menu(page: Any, wait_ms: int) -> bool:
    more_button = _find_more_tab_button(page)
    if more_button is None:
        return False
    try:
        expanded = (more_button.get_attribute("aria-expanded") or "").lower()
        if expanded != "true":
            more_button.click(timeout=5000)
            page.wait_for_timeout(wait_ms)
        return True
    except Exception:
        return False


def _extract_more_tab_items(page: Any) -> list[str]:
    script = """
    () => {
        const selectors = [
            '[role="menu"] [role="menuitem"]',
            '[role="menu"] [role="option"]',
            '[role="menuitem"]',
            '[role="option"]',
            '[role="menuitemcheckbox"]',
            '[role="menuitemradio"]',
            '[role="listitem"]',
            '[role="listitem"] [role="menuitem"]',
            '[data-testid*="menu-item"]',
            '[data-testid*="menu"] [data-testid*="item"]',
        ];
        const nodes = [];
        const seen = new Set();
        const push = (node) => {
            if (!(node instanceof HTMLElement)) {
                return;
            }
            const rect = node.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                return;
            }
            const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
            if (!text) {
                return;
            }
            const lowered = text.toLowerCase();
            if (seen.has(lowered) || lowered === 'more' || lowered === 'grid' || lowered === 'table' || lowered.includes('settings')) {
                return;
            }
            seen.add(lowered);
            nodes.push({text, index: nodes.length});
        };

        for (const selector of selectors) {
            for (const node of Array.from(document.querySelectorAll(selector))) {
                push(node);
            }
        }

        if (nodes.length > 0) {
            return nodes.map((item) => item.text);
        }

        // fallback: include first-level button-ish items in likely dropdown overlays
        const fallbackSelectors = [
            '[role="menu"] button',
            '[role="menu"] div[tabindex]',
            '[data-testid*="menu"] button',
            '[data-testid*="dropdown"] button',
            '.ant-menu-item',
            '.dropdown-content button',
            '.dropdown-item',
        ];
        const fallbackNodes = [];
        const fallbackSeen = new Set();
        const pushFallback = (node) => {
            if (!(node instanceof HTMLElement)) {
                return;
            }
            const rect = node.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                return;
            }
            const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
            if (!text) {
                return;
            }
            const lowered = text.toLowerCase();
            if (fallbackSeen.has(lowered) || lowered === 'more') {
                return;
            }
            fallbackSeen.add(lowered);
            fallbackNodes.push(text);
        };
        for (const selector of fallbackSelectors) {
            for (const node of Array.from(document.querySelectorAll(selector))) {
                pushFallback(node);
            }
        }
        return fallbackNodes;
    }
    """
    try:
        values = page.evaluate(script)
        if isinstance(values, list):
            return [str(value).strip() for value in values if isinstance(value, str) and value.strip()]
    except Exception:
        return []
    return []


def _select_more_menu_item(page: Any, index: int, wait_ms: int, label: str | None = None) -> bool:
    if index < 0:
        return False
    script = """
    (payload) => {
        const targetLabel = ((payload.label || '').replace(/\\u200b/g, '').replace(/\\s+/g, ' ').trim().toLowerCase());
        const targetIndex = Number.isFinite(payload.index) ? Number(payload.index) : -1;
        const selectors = [
            '[role="menu"] [role="menuitem"]',
            '[role="menu"] [role="option"]',
            '[role="menuitem"]',
            '[role="option"]',
            '[role="menuitemcheckbox"]',
            '[role="menuitemradio"]',
            '[role="listitem"]',
            '[role="listitem"] [role="menuitem"]',
            '[data-testid*="menu-item"]',
            '[data-testid*="menu"] [data-testid*="item"]',
            '[role="menu"] button',
            '[role="menu"] div[tabindex]',
            '[data-testid*="menu"] button',
            '[data-testid*="dropdown"] button',
            '.ant-menu-item',
            '.dropdown-content button',
            '.dropdown-item',
        ];
        const nodes = [];
        const push = (node) => {
            if (!(node instanceof HTMLElement)) {
                return;
            }
            const rect = node.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                return;
            }
            nodes.push(node);
        };

        for (const selector of selectors) {
            for (const node of Array.from(document.querySelectorAll(selector))) {
                push(node);
            }
        }

        if (targetLabel) {
            for (const node of nodes) {
                const candidate = ((node.textContent || '').replace(/\\u200b/g, '').replace(/\\s+/g, ' ').trim().toLowerCase());
                if (candidate === targetLabel || candidate.includes(targetLabel) || targetLabel.includes(candidate)) {
                    if (typeof node.scrollIntoView === 'function') {
                        node.scrollIntoView({ block: 'center' });
                    }
                    node.click();
                    return true;
                }
            }
        }

        const target = nodes[targetIndex];
        if (!target) {
            return false;
        }
        if (typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ block: 'center' });
        }
        target.click();
        return true;
    }
    """
    try:
        if not _open_more_tabs_menu(page, wait_ms=wait_ms):
            return False
        return bool(page.evaluate(script, {"index": index, "label": label}))
    except Exception:
        return False


def _extract_rows_from_page(page: Any) -> list[dict[str, Any]]:
    rendered_html = page.content()
    parser = _AirtableHtmlRowParser()
    parser.feed(rendered_html)
    rows = parser.rows
    if rows:
        return rows

    script = """
    () => {
        const rowSelector = [
            '[role="row"][aria-rowindex]',
            '[data-row-id]',
            '[data-record-id]'
        ].join(',');
        const rows = Array.from(document.querySelectorAll(rowSelector));
        return rows
            .map((rowEl) => {
                const rowIndex = parseInt(rowEl.getAttribute('aria-rowindex') || '', 10);
                const rowData = {
                    _airtable_row_index: Number.isFinite(rowIndex) ? rowIndex : null,
                    _airtable_row_key:
                        rowEl.getAttribute('data-row-id') ||
                        rowEl.getAttribute('data-record-id') ||
                        rowEl.getAttribute('data-level-item-key') ||
                        null,
                };

                const cells = Array.from(
                    rowEl.querySelectorAll('[aria-colindex], [data-columnid], [data-testid="row-column-container"]')
                );
                for (const cell of cells) {
                    const colText = cell.getAttribute('aria-colindex');
                    const colId = cell.getAttribute('data-columnid');
                    let key = colId ? `col_${colId}` : null;
                    if (colText) {
                        const colNum = parseInt(colText, 10);
                        if (Number.isFinite(colNum)) {
                            key = `col_${colNum}`;
                        }
                    }
                    if (!key) {
                        continue;
                    }

                    const value = (cell.textContent || '').replace(/\\s+/g, ' ').trim();
                    if (!value) {
                        continue;
                    }
                    rowData[key] = value;
                }

                if (Object.keys(rowData).some((k) => k.startsWith('col_'))) {
                    return rowData;
                }
                return null;
            })
            .filter(Boolean);
    }
    """
    try:
        evaluated = page.evaluate(script)
    except Exception:
        evaluated = []

    if isinstance(evaluated, list):
        for row in evaluated:
            if not isinstance(row, dict):
                continue
            rows.append({
                key: value
                for key, value in row.items()
                if isinstance(key, str) and value not in (None, "")
            })
    return rows


def _scroll_table_once(page: Any) -> bool:
    script = """
    () => {
        const rowSelector = '[role=\"row\"][aria-rowindex], [data-row-id], [data-record-id]';
        const selectorCandidates = Array.from(
            document.querySelectorAll(
                '[role=\"grid\"], [role=\"table\"], [data-testid=\"grid-body\"], [data-testid=\"table-body\"], '
                + '.airtable-grid-body, .antiscroll-inner, .scrollOverlay, .scroll-area, [data-testid*=\"virtual\"], [data-testid*=\"grid\"]'
            )
        );
        const overflowCandidates = Array.from(document.querySelectorAll('*')).filter((el) => {
            if (!(el instanceof HTMLElement)) {
                return false;
            }
            const style = window.getComputedStyle(el);
            const overflowY = style.overflowY || '';
            const isScrollable = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
            if (!isScrollable) {
                return false;
            }
            return el.scrollHeight > el.clientHeight + 24;
        });
        const hasRowChildren = (el) => {
            if (!el || !el.querySelector) {
                return false;
            }
            return !!(
                el.querySelector(rowSelector) ||
                el.querySelector('[data-row-id]') ||
                el.querySelector('[data-record-id]')
            );
        };
        const cached = Array.isArray(window.__councillorScraperScrollTargets) ? window.__councillorScraperScrollTargets : [];
        const cachedActive = cached
            .filter((el) => el instanceof HTMLElement)
            .filter((el) => el.scrollHeight > el.clientHeight + 24);
        const gridCandidates = Array.from(new Set(selectorCandidates.concat(overflowCandidates).concat(cachedActive))).filter(
            (el) => el instanceof HTMLElement && el.scrollHeight > el.clientHeight + 24
        );
        const prioritized = gridCandidates.filter(hasRowChildren).concat(gridCandidates.filter((el) => !hasRowChildren(el)));

        let scrolled = false;
        for (const el of prioritized) {
            const before = el.scrollTop;
            const delta = Math.max(250, Math.round((el.clientHeight || 0) * 0.85));
            el.scrollTop = before + delta;
            el.dispatchEvent(new Event('scroll', { bubbles: true }));
            if (el.scrollTop !== before) {
                scrolled = true;
            }
        }
        if (scrolled) {
            return true;
        }

        for (const el of prioritized) {
            const before = el.scrollTop;
            el.scrollTop = el.scrollHeight;
            el.dispatchEvent(new Event('scroll', { bubbles: true }));
            if (el.scrollTop !== before) {
                scrolled = true;
            }
        }
        if (scrolled) {
            return true;
        }

        const before = window.scrollY;
        window.scrollBy(0, window.innerHeight * 0.9);
        window.dispatchEvent(new Event('scroll'));
        return window.scrollY !== before;
    }
    """
    try:
        return bool(page.evaluate(script))
    except Exception:
        return False


def _click_and_collect_tabs(
    page: Any,
    timeout_ms: int,
    wait_ms: int,
    output_dir: Path | None = None,
    emit_progress: bool = True,
) -> dict[str, list[dict[str, Any]]]:
    rows_by_tab: dict[str, list[dict[str, Any]]] = {}
    seen_names: set[str] = set()
    if output_dir is not None:
        output_dir.mkdir(parents=True, exist_ok=True)
        if emit_progress:
            print(f"[progress] per-councillor outputs will be written to {output_dir}")

    def ensure_unique_name(name: str) -> str:
        base = _normalise_tab_name(name, len(rows_by_tab))
        candidate = base
        suffix = 1
        while candidate in seen_names:
            suffix += 1
            candidate = f"{base}_{suffix}"
        seen_names.add(candidate)
        return candidate

    def collect_for_tab(name: str, progress_label: str) -> None:
        if emit_progress:
            print(f"[{progress_label}] {name}")
        collected = _collect_current_tab_rows(page, wait_ms=wait_ms)
        if collected:
            safe_name = ensure_unique_name(name)
            rows_by_tab[safe_name] = collected
            if emit_progress:
                print(f"  - collected {len(collected)} rows")
            if output_dir is not None:
                _, csv_path, json_path = _write_single_councillor_output(
                    safe_name,
                    collected,
                    output_dir,
                )
                if emit_progress:
                    print(f"  - saved {csv_path.name}, {json_path.name}")
        elif emit_progress:
            print("  - no rows found")

    def normalized_name(name: str) -> str:
        return _normalise_tab_name(name, len(seen_names))

    tab_selector = '[role="tab"]'
    try:
        tab_count = page.locator(tab_selector).count()
    except Exception:
        tab_count = 0
    if tab_count <= 1:
        try:
            fallback_selector = '[role="button"][aria-selected], [data-testid*="tab"]'
            tab_count = page.locator(fallback_selector).count()
            if tab_count > 1:
                tab_selector = fallback_selector
        except Exception:
            tab_count = 0

    if tab_count <= 1:
        fallback_name = _normalise_tab_name("councillor", 0)
        if emit_progress:
            print("[1/1] processing fallback")
        collect_for_tab(fallback_name, "1/1")
        return rows_by_tab

    visible_tab_count = tab_count
    if emit_progress:
        print(f"[progress] found {visible_tab_count} visible tab(s), collecting")

    processed_count = 0
    for index in range(tab_count):
        try:
            tab = page.locator(tab_selector).nth(index)
            if not tab.is_visible():
                continue
            tab_name = _extract_tab_name(tab, f"councillor_{index + 1}")
            if not _is_councillor_label_candidate(tab_name):
                continue
            if normalized_name(tab_name) in seen_names:
                continue
            processed_count += 1
            progress_label = f"{processed_count}"
            if emit_progress:
                print(f"[progress] processing visible tab {progress_label}/{visible_tab_count}")
            tab.click(timeout=5000)
            page.wait_for_timeout(wait_ms)
            try:
                page.wait_for_load_state("networkidle", timeout=timeout_ms)
            except Exception:
                pass
            page.wait_for_timeout(wait_ms)
            collect_for_tab(tab_name, f"{progress_label}/{visible_tab_count}")
        except Exception:
            continue

    # Some tabs are nested behind the "More" control.
    try:
        menu_items = _extract_more_tab_items(page)
        if not menu_items and _open_more_tabs_menu(page, wait_ms=wait_ms):
            menu_items = _extract_more_tab_items(page)
    except Exception:
        menu_items = []

    if menu_items:
        if emit_progress:
            print(f"[progress] found {len(menu_items)} tab(s) in More menu")
        for index, raw_item in enumerate(menu_items):
            cleaned = _normalise_text(raw_item)
            if not cleaned:
                continue
            if not _is_councillor_label_candidate(cleaned):
                continue
            if normalized_name(cleaned) in seen_names:
                continue
            processed_count += 1
            progress_label = f"{processed_count}"
            if emit_progress:
                print(f"[progress] processing hidden tab {progress_label}")
            if not _select_more_menu_item(page, index, wait_ms=wait_ms, label=cleaned):
                continue
            try:
                page.wait_for_timeout(wait_ms)
                try:
                    page.wait_for_load_state("networkidle", timeout=timeout_ms)
                except Exception:
                    pass
                page.wait_for_timeout(wait_ms)
                collect_for_tab(cleaned, f"{progress_label}/{visible_tab_count + len(menu_items)}")
            except Exception:
                continue

    if not rows_by_tab:
        fallback_name = _normalise_tab_name("councillor", 0)
        if emit_progress:
            print("[1/1] fallback no valid tabs found")
        collect_for_tab(fallback_name, "1/1")

    return rows_by_tab


def _rows_with_councillor_name(rows_by_councillor: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    for councillor_name, rows in rows_by_councillor.items():
        for row in rows:
            merged.append({"councillor": councillor_name, **row})
    return merged


def _write_single_councillor_output(
    councillor_name: str,
    rows: list[dict[str, Any]],
    output_dir: Path,
) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    safe_name = _safe_output_name(councillor_name)
    csv_path = output_dir / f"{safe_name}.csv"
    json_path = output_dir / f"{safe_name}.json"
    decorated_rows = [{"councillor": councillor_name, **row} for row in rows]
    write_csv(decorated_rows, csv_path)
    write_json(decorated_rows, json_path)
    return csv_path, json_path


def _write_partitioned_outputs(
    rows_by_councillor: dict[str, list[dict[str, Any]]],
    output_dir: Path,
) -> list[tuple[str, Path, Path]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    saved: list[tuple[str, Path, Path]] = []

    for councillor_name, rows in rows_by_councillor.items():
        csv_path, json_path = _write_single_councillor_output(councillor_name, rows, output_dir)
        saved.append((councillor_name, csv_path, json_path))

    return saved


def _extract_rows_from_playwright(
    url: str,
    timeout_ms: int = 30000,
    wait_ms: int = 5000,
    per_councillor_output_dir: Path | None = None,
) -> tuple[dict[str, list[dict[str, Any]]], str]:
    if sync_playwright is None:
        raise ModuleNotFoundError(
            "playwright is required for rendering Airtable URLs. "
            "Install with `pip install playwright` and `python -m playwright install chromium`."
        )

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--disable-blink-features=AutomationControlled"])
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1600, "height": 1400},
        )
        page = context.new_page()
        try:
            response = page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            page.wait_for_load_state("networkidle", timeout=timeout_ms)
            page.wait_for_timeout(wait_ms)
            rows_by_tab = _click_and_collect_tabs(
                page,
                timeout_ms=timeout_ms,
                wait_ms=wait_ms,
                output_dir=per_councillor_output_dir,
            )

            for rows in rows_by_tab.values():
                rows.sort(key=lambda row: row.get("_airtable_row_index") or 0)
            resolved_source = response.url if response is not None else url
            return rows_by_tab, resolved_source
        finally:
            context.close()
            browser.close()


def _looks_like_url(value: str) -> bool:
    return value.lower().startswith("http://") or value.lower().startswith("https://")


def _normalise_text(value: str) -> str:
    value = html.unescape(value)
    value = value.replace("\u200b", "")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def _parse_init_data(html_text: str) -> dict[str, Any] | None:
    match = INIT_DATA_RE.search(html_text)
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return None


def _infer_share_url(init_data: dict[str, Any] | None) -> str | None:
    if not isinstance(init_data, dict):
        return None
    app_id = init_data.get("singleApplicationId")
    share_id = init_data.get("shareId")
    if not isinstance(app_id, str) or not isinstance(share_id, str):
        return None
    return f"https://airtable.com/{app_id}/{share_id}"


def _parse_record_count(html_text: str) -> int | None:
    m = re.search(r'>(\s*[0-9][0-9,]*)\s+records?\s*<', html_text)
    if not m:
        return None
    try:
        return int(m.group(1).replace(",", "").strip())
    except ValueError:
        return None


class _AirtableHtmlRowParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[dict[str, Any]] = []
        self._in_row = False
        self._row_div_depth = 0
        self._current_row: dict[str, Any] = {}
        self._current_row_index: int | None = None
        self._current_record_key: str | None = None
        self._in_cell = False
        self._cell_div_depth = 0
        self._current_cell_col: int | None = None
        self._cell_buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "div":
            return

        attrs_map = {name: value or "" for name, value in attrs}
        role = attrs_map.get("role", "")
        aria_rowindex = attrs_map.get("aria-rowindex", "")
        is_row = role == "row" and bool(aria_rowindex)
        is_cell = attrs_map.get("data-testid") == "row-column-container" and attrs_map.get("aria-colindex")

        if not self._in_row and is_row:
            try:
                row_index = int(aria_rowindex)
            except ValueError:
                row_index = None
            self._in_row = True
            self._row_div_depth = 1
            self._current_row = {
                "_airtable_row_index": row_index,
                "_airtable_row_key": attrs_map.get("data-level-item-key") or None,
            }
            self._current_row_index = row_index
            self._current_record_key = self._current_row["_airtable_row_key"]
            return

        if self._in_row:
            self._row_div_depth += 1
            if self._in_cell:
                self._cell_div_depth += 1
            elif is_cell:
                col_text = attrs_map.get("aria-colindex", "").strip()
                try:
                    col = int(col_text)
                except ValueError:
                    col = None
                if col is not None:
                    self._in_cell = True
                    self._cell_div_depth = 1
                    self._current_cell_col = col
                    self._cell_buffer = []

    def handle_endtag(self, tag: str) -> None:
        if tag != "div":
            return
        if self._in_cell:
            self._cell_div_depth -= 1
            if self._cell_div_depth == 0:
                text = _normalise_text("".join(self._cell_buffer))
                if text and self._current_cell_col is not None:
                    self._current_row[f"col_{self._current_cell_col}"] = text
                self._in_cell = False
                self._current_cell_col = None
                self._cell_buffer = []

        if self._in_row:
            self._row_div_depth -= 1
            if self._row_div_depth == 0:
                row = {
                    key: value
                    for key, value in self._current_row.items()
                    if isinstance(key, str) and value not in (None, "")
                }
                self.rows.append(row)
                self._in_row = False
                self._current_row = {}
                self._current_row_index = None
                self._current_record_key = None

    def handle_data(self, data: str) -> None:
        if self._in_cell:
            self._cell_buffer.append(data)


def _load_html(source: str) -> tuple[str, str]:
    if _looks_like_url(source):
        request = urllib.request.Request(
            source,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            html_bytes = response.read()
            return html_bytes.decode("utf-8", errors="replace"), response.geturl()
    else:
        path = Path(source)
        return path.read_text(encoding="utf-8"), str(path.resolve())


def scrape_airtable_html(source: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    html_text, resolved_source = _load_html(source)
    parser = _AirtableHtmlRowParser()
    parser.feed(html_text)

    rows = parser.rows
    rows.sort(key=lambda row: row.get("_airtable_row_index") or 0)

    output_meta: dict[str, Any] = {
        "source": resolved_source,
        "rows_found": len(rows),
        "records_hint": _parse_record_count(html_text),
        "init_data": {},
        "share_url": None,
    }
    init_data = _parse_init_data(html_text)
    if init_data:
        output_meta["init_data"] = {
            "shareId": init_data.get("shareId"),
            "singleApplicationId": init_data.get("singleApplicationId"),
            "sharedPageId": init_data.get("sharedPageId"),
            "baseUrl": init_data.get("baseUrl"),
        }
        output_meta["share_url"] = _infer_share_url(init_data)

    return rows, output_meta


def write_csv(rows: list[dict[str, Any]], path: Path) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return

    columns = set()
    for row in rows:
        columns.update(k for k in row.keys() if not k.startswith("_airtable_"))

    ordered_cols = ["councillor", "_airtable_row_index", "_airtable_row_key"]
    for index in sorted(c for c in range(1, 20) if f"col_{c}" in columns):
        ordered_cols.append(f"col_{index}")
    for col in sorted(columns):
        if col.startswith("col_"):
            continue
        if col not in ordered_cols:
            ordered_cols.append(col)
    for key in columns:
        if key not in ordered_cols:
            ordered_cols.append(key)

    fieldnames = ordered_cols
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({col: row.get(col, "") for col in fieldnames})


def write_json(rows: list[dict[str, Any]], path: Path) -> None:
    normalized_rows: list[dict[str, Any]] = []
    for row in rows:
        normalized_row: dict[str, Any] = {}
        for raw_key, value in row.items():
            if raw_key.startswith("col_"):
                index = raw_key.removeprefix("col_")
                if index.isdigit():
                    normalized_row[DEFAULT_COLUMNS.get(int(index), raw_key)] = value
                else:
                    normalized_row[raw_key] = value
            elif raw_key == "_airtable_row_index":
                normalized_row["airtable_row_index"] = value
            elif raw_key == "_airtable_row_key":
                normalized_row["airtable_row_key"] = value
            else:
                normalized_row[raw_key] = value
        normalized_rows.append(normalized_row)
    path.write_text(json.dumps(normalized_rows, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Parse Airtable shared-page HTML content and export the rendered rows."
    )
    parser.add_argument(
        "source",
        nargs="?",
        default="Interface_ Votes by Councillor - Airtable.html",
        help="Path to a saved Airtable HTML file or a full Airtable URL.",
    )
    parser.add_argument("--csv", type=Path, default=Path("votes_by_councillor.csv"), help="CSV output path")
    parser.add_argument("--json", type=Path, default=Path("votes_by_councillor.json"), help="JSON output path")
    parser.add_argument(
        "--per-councillor-dir",
        type=Path,
        default=Path("votes_by_councillor_by_councillor"),
        help="Directory for CSV/JSON files saved per councillor/tab.",
    )
    parser.add_argument(
        "--no-per-councillor",
        action="store_true",
        help="Skip per-councillor output files.",
    )
    parser.add_argument("--timeout-ms", type=int, default=30000)
    parser.add_argument("--wait-ms", type=int, default=5000)
    parser.add_argument(
        "--no-playwright",
        action="store_true",
        help="Disable Playwright fallback when requesting an Airtable URL.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rows_by_councillor: dict[str, list[dict[str, Any]]]
    rows, meta = scrape_airtable_html(args.source)
    rows_by_councillor = {"councillor": rows} if rows else {}

    if not rows and _looks_like_url(args.source) and not args.no_playwright:
        print("No rows found in initial HTML; trying JS-rendered Airtable page.")
        try:
            rows_by_councillor, rendered_source = _extract_rows_from_playwright(
                args.source,
                timeout_ms=args.timeout_ms,
                wait_ms=args.wait_ms,
                per_councillor_output_dir=None if args.no_per_councillor else args.per_councillor_dir,
            )
            meta["source"] = rendered_source
            meta["rendered_source"] = True
        except ModuleNotFoundError as error:
            raise SystemExit(f"{error}") from error
        except Exception as error:
            print(f"Rendered fetch failed: {error}", file=sys.stderr)

    total_rows = sum(len(rows) for rows in rows_by_councillor.values())
    if total_rows == 0:
        raise SystemExit(
            "No row elements were found for this source. "
            "Airtable may require JS rendering or the share may be private/blocked. "
            "Install Playwright to enable browser rendering fallback."
        )

    meta["rows_found"] = total_rows

    merged_rows = _rows_with_councillor_name(rows_by_councillor)

    write_csv(merged_rows, args.csv)
    write_json(merged_rows, args.json)

    per_tab_paths = []
    if not args.no_per_councillor:
        per_tab_paths = _write_partitioned_outputs(rows_by_councillor, args.per_councillor_dir)

    source_label = "rendered page" if meta.get("rendered_source") else "HTML"

    if meta["records_hint"] and total_rows < int(meta["records_hint"]):
        print(
            f"Parsed {total_rows} rows from {source_label}. Total on page shows {meta['records_hint']} rows, "
            "so this is likely a partial slice."
        )
    else:
        print(f"Parsed {total_rows} rows from {source_label}.")
    print(f"CSV: {args.csv.resolve()}")
    print(f"JSON: {args.json.resolve()}")
    if per_tab_paths:
        print(f"Per-councillor files: {args.per_councillor_dir.resolve()}")
    if meta["share_url"]:
        print(f"Detected share URL: {meta['share_url']}")


if __name__ == "__main__":
    main()
