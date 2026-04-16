// 위치: src/app/index.tsx

import TestController from '@/components/test_controller/test_controller';

export default function App() {
    return (
        <div style={{ 
            width: '100vw', 
            height: '100vh', 
            backgroundColor: '#121212',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
        }}>
            <TestController />
        </div>
    );
}