import AppProvider from "./provider";
import TestController from '@/components/test_controller/test_controller';
// import AppRouter from "./router"; // 잠시 라우터 끄기

function App() {
    return (
        <AppProvider>
            {/* 테스트용 UI 화면 중앙 띄우기 */}
            <div style={{ width: '100vw', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' }}>
                <TestController />
            </div>
        </AppProvider>
    );
}

export default App;