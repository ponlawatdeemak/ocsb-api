import { ResponseDto } from '@interface/config/app.config'
import { GetLutDtoIn } from '@interface/dto/lookup/lookup.dto-in'
import { GetLutDtoOut } from '@interface/dto/lookup/lookup.dto-out'
import { Controller, Get, Query } from '@nestjs/common'
// import { snakeCase } from 'change-case'
import { mockLookup } from './mock-lookup'

@Controller('lookup')
export class LookupController {
	@Get()
	// @UseGuards(AuthGuard)
	async get(@Query() payload: GetLutDtoIn): Promise<ResponseDto<GetLutDtoOut[]>> {
		/**
		 * table name: change case parameter "name" => req-bldg-permit-type to lut_req_bldg_permit_type
		 */
		// const tableName = `lut_${snakeCase(payload.name)}`
		// const repository = this.dataSource.getRepository(tableName)

		// // order ใส่ "" ป้องกัน field ทีเป็น reserved word ใน sql
		// const result = await repository
		// 	.createQueryBuilder()
		// 	.where(payload.where || {})
		// 	.select('*')
		// 	.orderBy(`"${payload.sort || 'id'}"`, payload.order || 'ASC')
		// 	.execute()

		return new ResponseDto({ data: mockLookup })
	}
}
