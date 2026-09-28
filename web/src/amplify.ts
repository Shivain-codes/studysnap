import { Amplify } from 'aws-amplify';
import { config } from './config';

/**
 * Configure Amplify Auth (Cognito User Pool) for the drop-in Authenticator.
 * Values come from ./config (VITE_* env with deployed-stack fallbacks).
 */
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: config.userPoolId,
      userPoolClientId: config.userPoolClientId,
      loginWith: { email: true },
    },
  },
});
