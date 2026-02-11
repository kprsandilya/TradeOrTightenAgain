import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { GameProvider, useGame } from "./context/GameContext";
import { AuthProvider, getDisplayNameFromCognitoUser } from "./context/AuthContext";
import { isAmplifyConfigured } from "./lib/amplify-config";
import "./App.css";
import { JoinScreen } from "./components/JoinScreen";
import { GameScreen } from "./components/GameScreen";
import { GameEndedScreen } from "./components/GameEndedScreen";

function AppContent() {
	const { state, gameCode, gameEnded } = useGame();
	if (gameEnded || state?.status === "stopped") return <GameEndedScreen />;
	if (gameCode && state) return <GameScreen />;
	return <JoinScreen />;
}

function GameApp() {
	return (
		<GameProvider>
			<AppContent />
		</GameProvider>
	);
}

/** When Amplify is configured, wrap app in Authenticator and require login. */
function AppWithAuth() {
	if (!isAmplifyConfigured) {
		return <GameApp />;
	}

	return (
		<Authenticator>
			{({
				signOut,
				user,
			}: {
				signOut: () => void;
				user: { username?: string; userId?: string; signInDetails?: { loginId?: string }; attributes?: { email?: string } };
			}) => (
				<AuthProvider
					user={{
						userId: user?.userId ?? user?.username ?? "",
						displayName: getDisplayNameFromCognitoUser(user ?? {}),
					}}
					signOut={signOut}
				>
					<GameApp />
				</AuthProvider>
			)}
		</Authenticator>
	);
}

function App() {
	return <AppWithAuth />;
}

export default App;
