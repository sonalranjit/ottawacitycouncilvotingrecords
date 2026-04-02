import { createHashRouter, Navigate } from 'react-router-dom';
import App from './App';
import MotionsByDate from './pages/MotionsByDate';
import CouncillorHistory from './pages/CouncillorHistory';
import About from './pages/About';
import Tags from './pages/Tags';

const router = createHashRouter([
  {
    path: '/',
    element: <Navigate to="/ottawa" replace />,
  },
  {
    path: '/ottawa',
    element: <App />,
    children: [
      { index: true, element: <MotionsByDate /> },
      { path: 'councillors', element: <CouncillorHistory /> },
      { path: 'councillors/:slug', element: <CouncillorHistory /> },
      { path: 'tags', element: <Tags /> },
      { path: 'tags/:slug', element: <Tags /> },
      { path: 'about', element: <About /> },
    ],
  },
]);

export default router;
