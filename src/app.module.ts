import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module'
import { LookupController } from './lookup/lookup.controller'
import { ProfileController } from './profile/profile.controller'
import { UMController } from './um/um.controller'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TypeOrmConfigService } from '@libs/typeorm'
import {
	BoundaryRegionEntity,
	DailyUsersEntity,
	PositionEntity,
	ProvincesEntity,
	RegionsEntity,
	RolesEntity,
	SugarcaneDsBurnAreaDailyEntity,
	SugarcaneDsRepeatAreaEntity,
	SugarcaneDsYieldPredEntity,
	UsersEntity,
	YearProductionEntity,
} from '@interface/entities'
import { RandomService } from './core/random.service'
import { MailService } from './core/mail.service'
import { OverviewController } from './overview/overview.controller'
import { SugarcaneHotspotEntity } from '@interface/entities/sugarcane-hotspot.entity'
import { BurntAreaController } from './burnt-area/burnt-area.controller'
import { BurntAreaService } from './burnt-area/burnt-area.service'
import { YieldAreaController } from './yield-area/yield-area.controller'
import { YieldService } from './yield-area/yield-area.service'
import { ExportController } from './export/export.controller'
import { ExportService } from './export/export.service'
import { LineService } from './core/line.service'
import { HttpModule } from '@nestjs/axios'
import { ScheduleModule } from '@nestjs/schedule'
import { AppController } from './app.controller'
import { ReverseProxyController } from './reverse-proxy/reverse-proxy.controller'
import { ReverseProxyService } from './reverse-proxy/reverse-proxy.service'

const imports = [
	ConfigModule.forRoot({ isGlobal: true }),
	TypeOrmModule.forRootAsync({ useClass: TypeOrmConfigService }),
	TypeOrmModule.forFeature([
		UsersEntity,
		RolesEntity,
		PositionEntity,
		RegionsEntity,
		ProvincesEntity,
		YearProductionEntity,
		SugarcaneHotspotEntity,
		SugarcaneDsBurnAreaDailyEntity,
		SugarcaneDsYieldPredEntity,
		SugarcaneDsRepeatAreaEntity,
		BoundaryRegionEntity,
		DailyUsersEntity,
	]),
	AuthModule,
	HttpModule,
	ScheduleModule.forRoot(),
]
@Module({
	imports: imports,
	controllers: [
		LookupController,
		OverviewController,
		ProfileController,
		UMController,
		BurntAreaController,
		YieldAreaController,
		ExportController,
		AppController,
		ReverseProxyController,
	],
	providers: [
		RandomService,
		MailService,
		BurntAreaService,
		YieldService,
		ExportService,
		LineService,
		ReverseProxyService,
	],
})
export class AppModule {}
