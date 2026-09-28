import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import './amplify';
import Dashboard from './pages/Dashboard';

/**
 * Auth-gated app. The Amplify Authenticator drop-in handles signup, email
 * confirmation, login, and password reset against the Cognito User Pool.
 * Authenticated content (Dashboard, and later Upload/Kit/Quiz-Me) renders inside.
 */
export default function App() {
  return (
    <Authenticator signUpAttributes={['email']} loginMechanisms={['email']}>
      {({ signOut, user }) => (
        <div className="app">
          <header className="topbar">
            <span className="logo">StudySnap</span>
            <div className="topbar-right">
              <span className="user-email">{user?.signInDetails?.loginId ?? ''}</span>
              <button className="btn-ghost" onClick={signOut}>
                Sign out
              </button>
            </div>
          </header>
          <main className="content">
            <Dashboard />
          </main>
        </div>
      )}
    </Authenticator>
  );
}
