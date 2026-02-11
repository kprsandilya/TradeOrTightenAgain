/**
 * AWS Amplify Auth configuration using Amazon Cognito.
 * Set these in .env (local) or in Amplify Hosting / your deployment environment:
 *
 *   VITE_AMPLIFY_USER_POOL_ID
 *   VITE_AMPLIFY_USER_POOL_CLIENT_ID
 *   VITE_AMPLIFY_REGION
 *
 * Create a User Pool in AWS Cognito, then create an App client (no secret for public SPA).
 */
import { Amplify } from "aws-amplify";

const userPoolId = import.meta.env.VITE_AMPLIFY_USER_POOL_ID as string | undefined;
const userPoolClientId = import.meta.env.VITE_AMPLIFY_USER_POOL_CLIENT_ID as string | undefined;
const region = import.meta.env.VITE_AMPLIFY_REGION as string | undefined;

export const isAmplifyConfigured =
	Boolean(userPoolId && userPoolClientId && region);

if (isAmplifyConfigured) {
	Amplify.configure({
		Auth: {
			Cognito: {
				userPoolId,
				userPoolClientId,
				region,
				loginWith: {
					email: true,
					username: true,
				},
				signUpVerificationMethod: "code",
				userAttributes: {
					email: { required: true },
				},
				passwordFormat: {
					minLength: 8,
					requireLowercase: true,
					requireUppercase: true,
					requireNumbers: true,
					requireSpecialCharacters: true,
				},
			},
		},
	});
}
