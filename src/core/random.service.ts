import { Injectable } from '@nestjs/common'

@Injectable()
export class RandomService {
	generateSixDigitString(): string {
		const randomNumber = Math.floor(Math.random() * 1000000) // number between 0 and 999999
		return randomNumber.toString().padStart(6, '0') // pad with leading zeros
	}
}
