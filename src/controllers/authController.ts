import { Request, Response } from 'express';
import { AuthService } from '../services/authService';

export class AuthController {
    static async authenticateUser(req: Request, res: Response) {
        try {
            const user = await AuthService.authenticateUser(req.body);
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            res.status(200).json(user);
        } catch (error) {
            res.status(500).json({ error: 'Authentication failed' });
        }
    }
}
