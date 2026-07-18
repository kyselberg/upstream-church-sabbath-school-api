import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { registry } from './metrics';

@Controller()
export class MetricsController {
  @Get('metrics')
  async metrics(@Res() res: Response) {
    res.setHeader('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  }
}
