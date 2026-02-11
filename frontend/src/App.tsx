import { GameProvider, useGame } from "./context/GameContext";
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

function App() {
	return (
		<GameProvider>
			<AppContent />
		</GameProvider>
	);
}

export default App;
