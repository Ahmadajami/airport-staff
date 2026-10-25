import { z } from 'zod';
// Define your Zod schema
export const formSchema = z.object({
	email: z.email('Please enter a valid email address.')
});