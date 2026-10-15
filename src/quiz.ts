import './styles/app.css';
import { startParticles } from './background/particles';
import { byId } from './dom';
import { createQuiz } from './game/quiz';

startParticles(byId<HTMLCanvasElement>('bg-particles'));
createQuiz();
