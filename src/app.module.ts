import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module'

let imports = [ConfigModule.forRoot({ isGlobal: true }), AuthModule]
@Module({
	imports: imports,
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
