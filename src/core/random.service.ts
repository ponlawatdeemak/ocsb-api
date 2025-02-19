import { Injectable } from '@nestjs/common'
import * as crypto from 'crypto'

@Injectable()
export class RandomService {
	generateSixDigitString(): string {
		const randomNumber = Math.floor(Math.random() * 1000000)
		return randomNumber.toString().padStart(6, '0')
	}

	generatePassword(): string {
		const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_-+=<>?'
		const randomBytes = crypto.randomBytes(12)
		return Array.from(randomBytes, (byte) => charset[byte % charset.length]).join('')
	}
}
