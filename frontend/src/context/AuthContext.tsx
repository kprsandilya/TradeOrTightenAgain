import { createContext, useContext, useMemo, type ReactNode } from "react";

export interface AuthUser {
	userId: string;
	/** Preferred display name for the game (username or email). */
	displayName: string;
}

interface AuthContextValue {
	user: AuthUser;
	signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
	children,
	user,
	signOut,
}: {
	children: ReactNode;
	user: AuthUser;
	signOut: () => void;
}) {
	const value = useMemo(() => ({ user, signOut }), [user, signOut]);
	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue | null {
	return useContext(AuthContext);
}

/** Derive a display name from Cognito/Amplify user (username or email). */
export function getDisplayNameFromCognitoUser(cognitoUser: {
	username?: string;
	userId?: string;
	signInDetails?: { loginId?: string };
	attributes?: { email?: string };
}): string {
	if (cognitoUser.username) return cognitoUser.username;
	const email = cognitoUser.attributes?.email;
	if (email && typeof email === "string") return email;
	const loginId = cognitoUser.signInDetails?.loginId;
	if (loginId && typeof loginId === "string") return loginId;
	return "Player";
}
