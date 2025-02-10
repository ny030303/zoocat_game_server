import { Router } from 'express';
import { UserController } from '../controllers/userController';

const router = Router();

router.post('/register', UserController.registerUser);

export default router;
