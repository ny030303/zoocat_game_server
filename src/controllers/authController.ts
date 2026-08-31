import { Request, Response } from 'express';
import { AuthService } from '../services/authService';

export class AuthController {
    static async authenticateUser(req: Request, res: Response) {
        try {
            const { userProfile, isNewUser } = await AuthService.loginOrRegister(req.body);
            res.status(isNewUser ? 201 : 200).json({ userProfile, isNewUser });
        } catch (error) {
            res.status(500).json({ error: 'Authentication failed' });
        }
    }
}
