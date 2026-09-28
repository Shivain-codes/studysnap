import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import './amplify';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import KitDetail from './pages/KitDetail';

/**
 * Auth-gated app. The Amplify Authenticator drop-in handles signup, email
 * confirmation, login, and password reset against the Cognito User Pool.
 * Authenticated content is routed: Dashboard, Upload, Kit detail (+ Quiz-Me later).
 */
export default function App() {
  return (
    <Authenticator signUpAttributes={['email']} loginMechanisms={['email']}>
      {({ signOut, user }) => (
        <BrowserRouter>
          <div className="app">
            <header className="topbar">
              <Link to="/" className="logo">
                StudySnap
              </Link>
              <div className="topbar-right">
                <span className="user-email">{user?.signInDetails?.loginId ?? ''}</span>
                <button className="btn-ghost" onClick={signOut}>
                  Sign out
                </button>
              </div>
            </header>
            <main className="content">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/upload" element={<Upload />} />
                <Route path="/kits/:id" element={<KitDetail />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      )}
    </Authenticator>
  );
}
