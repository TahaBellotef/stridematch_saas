import { Amplify } from 'aws-amplify';

export function configureAmplify() {
  const region = process.env.NEXT_PUBLIC_COGNITO_REGION;
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

  if (!region || !userPoolId || !clientId) {
    console.warn('Cognito credentials not configured');
    return false;
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: userPoolId,
        userPoolClientId: clientId,
        signUpVerificationMethod: 'code',
        loginWith: {
          email: true,
          username: true,
        },
      },
    },
  });

  return true;
}
