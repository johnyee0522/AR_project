// src/components/TestController/TestController.tsx
import React from "react";
import styles from "./TestController.module.css";

interface TestControllerProps {
    show: boolean;
    testCue: { x: number; y: number };
    setTestCue: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
    testObj1: { x: number; y: number };
    setTestObj1: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
    testObj2: { x: number; y: number };
    setTestObj2: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
    testAngle: number;
    setTestAngle: React.Dispatch<React.SetStateAction<number>>;
}

export default function TestController({
    show, testCue, setTestCue, testObj1, setTestObj1, testObj2, setTestObj2, testAngle, setTestAngle
}: TestControllerProps) {
    
    if (!show) return null;

    return (
        <div className={styles.panel}>
            <div className={styles.section}>
                <span className={`${styles.title} ${styles.colorCue}`}>⚪ 수구</span>
                <label className={styles.inputRow}>
                    X: <input type="range" min="0" max="1000" value={testCue.x} onChange={e => setTestCue({...testCue, x: Number(e.target.value)})} className={styles.slider}/>
                </label>
                <label className={styles.inputRow}>
                    Y: <input type="range" min="0" max="1000" value={testCue.y} onChange={e => setTestCue({...testCue, y: Number(e.target.value)})} className={styles.slider}/>
                </label>
            </div>
            
            <div className={styles.section}>
                <span className={`${styles.title} ${styles.colorObj1}`}>🔴 적구 1</span>
                <label className={styles.inputRow}>
                    X: <input type="range" min="0" max="1000" value={testObj1.x} onChange={e => setTestObj1({...testObj1, x: Number(e.target.value)})} className={styles.slider}/>
                </label>
                <label className={styles.inputRow}>
                    Y: <input type="range" min="0" max="1000" value={testObj1.y} onChange={e => setTestObj1({...testObj1, y: Number(e.target.value)})} className={styles.slider}/>
                </label>
            </div>

            <div className={styles.section}>
                <span className={`${styles.title} ${styles.colorObj2}`}>🟡 적구 2</span>
                <label className={styles.inputRow}>
                    X: <input type="range" min="0" max="1000" value={testObj2.x} onChange={e => setTestObj2({...testObj2, x: Number(e.target.value)})} className={styles.slider}/>
                </label>
                <label className={styles.inputRow}>
                    Y: <input type="range" min="0" max="1000" value={testObj2.y} onChange={e => setTestObj2({...testObj2, y: Number(e.target.value)})} className={styles.slider}/>
                </label>
            </div>

            <div className={styles.section}>
                <span className={`${styles.title} ${styles.colorAngle}`}>📐 각도 ({testAngle}도)</span>
                <label className={styles.inputRow}>
                    <input type="range" min="0" max="360" value={testAngle} onChange={e => setTestAngle(Number(e.target.value))} className={styles.sliderFull}/>
                </label>
            </div>
        </div>
    );
}