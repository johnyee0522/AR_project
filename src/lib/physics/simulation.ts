// 위치: src/lib/physics/simulation.ts

import type RAPIER from '@dimforge/rapier2d';

export class Simulation {
    private world: RAPIER.World;
    private rapier: typeof RAPIER;
    
    private ppm: number = 1; 

    private readonly TABLE_WIDTH_M = 2.84;
    private readonly TABLE_HEIGHT_M = 1.42;
    private readonly BALL_RADIUS_M = 0.03075;

    constructor(rapier: typeof RAPIER) {
        this.rapier = rapier;
        
        const gravity = { x: 0.0, y: 0.0 };
        this.world = new this.rapier.World(gravity);
    }

    public destroy() {
        this.world.free();
    }

    // [추가됨] 테스트 환경을 위해 물리 세계를 깨끗하게 비우는 메서드
    public clear() {
        this.world.free();
        const gravity = { x: 0.0, y: 0.0 };
        this.world = new this.rapier.World(gravity);
    }

    public createTable(canvasWidthPx: number, canvasHeightPx: number) {
        this.ppm = canvasWidthPx / this.TABLE_WIDTH_M;
        const tableHeightM = canvasHeightPx / this.ppm;

        const w = this.TABLE_WIDTH_M / 2;
        const h = tableHeightM / 2;
        const thickness = 0.1;

        this.createWall(w, h + thickness, w + thickness, thickness);
        this.createWall(w, -thickness, w + thickness, thickness);
        this.createWall(-thickness, h, thickness, h + thickness);
        this.createWall(this.TABLE_WIDTH_M + thickness, h, thickness, h + thickness);
    }

    private createWall(x: number, y: number, hx: number, hy: number) {
        const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(x, y);
        const body = this.world.createRigidBody(bodyDesc);

        const colliderDesc = this.rapier.ColliderDesc.cuboid(hx, hy)
            .setRestitution(0.85) 
            .setFriction(0.2);

        this.world.createCollider(colliderDesc, body);
    }

    public createBall(pxX: number, pxY: number) {
        const mX = pxX / this.ppm;
        const mY = pxY / this.ppm;

        const bodyDesc = this.rapier.RigidBodyDesc.dynamic().setTranslation(mX, mY);
        const body = this.world.createRigidBody(bodyDesc);

        const colliderDesc = this.rapier.ColliderDesc.ball(this.BALL_RADIUS_M)
            .setRestitution(0.92) 
            .setFriction(0.1)     
            .setDensity(1.0);     

        this.world.createCollider(colliderDesc, body);
        
        body.setLinearDamping(0.6);
        body.setAngularDamping(0.6);

        return body;
    }

    public step() {
        this.world.step();
    }

    public toPixelVector(metersX: number, metersY: number) {
        return {
            x: metersX * this.ppm,
            y: metersY * this.ppm
        };
    }

    public predictTrajectory(
        cueBall: RAPIER.RigidBody,
        allBalls: RAPIER.RigidBody[],
        angleDeg: number,
        power: number,
        maxSteps: number = 180
    ): { x: number, y: number }[] {
        
        const backupStates = allBalls.map(ball => ({
            translation: ball.translation(),
            rotation: ball.rotation(),
            linvel: ball.linvel(),
            angvel: ball.angvel()
        }));

        const angleRad = (angleDeg * Math.PI) / 180;
        const forceX = Math.cos(angleRad) * power;
        const forceY = Math.sin(angleRad) * power;
        
        cueBall.applyImpulse({ x: forceX, y: forceY }, true);

        const trajectoryPx: { x: number, y: number }[] = [];

        for (let i = 0; i < maxSteps; i++) {
            this.world.step();

            const pos = cueBall.translation();
            trajectoryPx.push(this.toPixelVector(pos.x, pos.y));

            const vel = cueBall.linvel();
            const speedSq = vel.x * vel.x + vel.y * vel.y;
            if (speedSq < 0.001) {
                break;
            }
        }

        allBalls.forEach((ball, index) => {
            const state = backupStates[index];
            ball.setTranslation(state.translation, true);
            ball.setRotation(state.rotation, true);
            ball.setLinvel(state.linvel, true);
            ball.setAngvel(state.angvel, true);
        });

        return trajectoryPx;
    }
}