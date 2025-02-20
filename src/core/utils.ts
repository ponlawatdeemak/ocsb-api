import * as bcrypt from 'bcryptjs'

const BCRYPT_SALT_ROUND = 10
const BCRYPT_SALT = bcrypt.genSaltSync(BCRYPT_SALT_ROUND)

export async function hashPassword(password: string) {
	return hash(password)
}

export async function hash(s: string) {
	const hashed = await bcrypt.hash(s, BCRYPT_SALT)
	return hashed
}

export function generateTokenHex(length) {
	const array = new Uint8Array(length)
	crypto.getRandomValues(array)
	return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function validatePayload(Arry: Array<string>) {
	const checkArray = Array.isArray(Arry) ? trimPayload(Arry) : trimPayload([Arry])
	return checkArray
}

export function trimPayload(Arry: Array<string>) {
	const trimmedData = Arry.map((item) => item.trim())
	return trimmedData
}

export function validateDateRange(startDate: Date, endDate: Date): string | void {
	if (startDate >= endDate) {
		return 'Invalid date range: start date must be before end date.'
	}

	const startMonth = startDate.getMonth()
	const endMonth = endDate.getMonth()
	const startYear = startDate.getFullYear()
	const endYear = endDate.getFullYear()

	if (
		(startMonth <= 8 && endMonth >= 9 && endYear === startYear) ||
		(startMonth === 8 && endMonth === 9 && endYear === startYear + 1)
	) {
		return 'Invalid date range: the date range cannot span across the planting period.'
	}

	if (startMonth === 9 && endMonth === 9 && endYear === startYear + 1) {
		return 'Invalid date range: the date range cannot span across two Octobers.'
	}

	return
}

export function generateMonthsFromYear(year: number): string[] {
	const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

	const result: string[] = []
	for (let i = 9; i < 12; i++) {
		result.push(`${year}-${months[i]}-01`)
	}
	for (let i = 0; i < 9; i++) {
		result.push(`${year + 1}-${months[i]}-01`)
	}

	return result
}

export function generateMonthsFromRange(startDate: string, endDate: string): string[] {
	const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
	const result: string[] = []

	// แปลง startDate และ endDate เป็นข้อมูลตัวเลข
	const [startYear, startMonth] = startDate.split('-').map(Number)
	const [endYear, endMonth] = endDate.split('-').map(Number)

	let currentYear = startYear
	let currentMonth = startMonth - 1 // ใช้ index 0 สำหรับ array ของ months

	// วนลูปจนถึง endDate
	while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth - 1)) {
		result.push(`${currentYear}-${months[currentMonth]}-01`)
		currentMonth++

		// ถ้าเดือนเกิน 12 ให้เปลี่ยนเป็นเดือนมกราคมของปีถัดไป
		if (currentMonth === 12) {
			currentMonth = 0
			currentYear++
		}
	}

	// เติมเดือนที่เหลือให้ครบ 12 เดือน ถ้าอยู่ในปีเดียวกัน
	while (result.length % 12 !== 0) {
		result.push(`${currentYear}-${months[currentMonth]}-01`)
		currentMonth++
		if (currentMonth === 12) {
			currentMonth = 0
			currentYear++
		}
	}

	return result
}

export function getStartAndEndOfMonth(dateString: string): { startDate: Date; endDate: Date } {
	const date = new Date(dateString)

	if (isNaN(date.getTime())) {
		throw new Error(`Invalid date format: ${dateString}`)
	}

	const startDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1))

	const endDate = new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 0))

	startDate.setUTCHours(0, 0, 0, 0)
	endDate.setUTCHours(23, 59, 59, 999)

	return { startDate, endDate }
}

export function sumby(data, key) {
	const sum = data.reduce((accumulator, currentValue) => {
		return accumulator + parseFloat(currentValue[key])
	}, 0)
	return sum
}
