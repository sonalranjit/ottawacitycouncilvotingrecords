import { createHashRouter } from 'react-router-dom';
import App from './App';
import MotionsByDate from './pages/MotionsByDate';
import CouncillorHistory from './pages/CouncillorHistory';

const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <MotionsByDate /> },
      { path: 'councillors', element: <CouncillorHistory /> },
      { path: 'councillors/:slug', element: <CouncillorHistory /> },
    ],
  },
]);

export default router;
