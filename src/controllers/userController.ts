import { Request, Response } from 'express';
import { UserService } from '../services/userService';

export class UserController {
    static async registerUser(req: Request, res: Response) {
        try {
            const result = await UserService.registerUser(req.body);
            res.status(201).json(result);
        } catch (error) {
            res.status(400).json({ error: error });
        }
    }
}
