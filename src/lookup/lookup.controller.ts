import { ResponseDto } from '@interface/config/app.config'
import { GetLookupDtoIn } from '@interface/dto/lookup/lookup.dto-in'
import { GetLookupDtoOut } from '@interface/dto/lookup/lookup.dto-out'
import { Controller, Get, Query } from '@nestjs/common'
import { snakeCase } from 'change-case'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
@Controller('lookup')
export class LookupController {
	constructor(
		@InjectDataSource()
		private readonly dataSource: DataSource,
	) {}
	@Get()
	// @UseGuards(AuthGuard)
	async get(@Query() payload: GetLookupDtoIn): Promise<ResponseDto<GetLookupDtoOut[]>> {
		/**
		 * table name: change case parameter "name" => req-bldg-permit-type to lut_req_bldg_permit_type
		 */
		const tableName = `${snakeCase(payload.name)}`
		const repository = this.dataSource.getRepository(tableName)

		// order ใส่ "" ป้องกัน field ทีเป็น reserved word ใน sql
		const result = await repository
			.createQueryBuilder()
			.where(payload.where || {})
			.select('*')
			.orderBy(payload.sort, payload.order)
			.execute()

		return new ResponseDto({ data: result })
	}
}
