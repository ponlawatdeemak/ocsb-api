import * as bcrypt from 'bcryptjs'

const BCRYPT_SALT_ROUND = 10
const BCRYPT_SALT = bcrypt.genSaltSync(BCRYPT_SALT_ROUND)

export async function hashPassword(password: string) {
	return hash(password)
}

export async function hash(s: string) {
	// const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUND)

	const hashed = await bcrypt.hash(s, BCRYPT_SALT)
	return hashed
}

export function generateTokenHex(length) {
	const array = new Uint8Array(length)
	crypto.getRandomValues(array)
	return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
