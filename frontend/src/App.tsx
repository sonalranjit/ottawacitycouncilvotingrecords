import { Outlet } from 'react-router-dom';
import Header from './components/layout/Header';
import styles from './App.module.scss';

export default function App() {
  return (
    <div className={styles.shell}>
      <Header />
      <main className={styles.main}>
        <div className={styles.container}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
