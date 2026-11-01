import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { AppNotification, Page, PushSubscription, UnreadCount } from '@kidzzy/shared';
import { SignedIn } from '../auth/access.decorators';
import { ListNotificationsQueryDto } from './dto/list-notifications.query';
import { PushSubscriptionCreateDto } from './dto/push-subscription.create';
import { NotificationsService } from './notifications.service';

/**
 * The notification center and web-push registration (TS-02). Each route is @SignedIn, matching
 * x-permission in openapi.yaml. A temporary password still cannot call them.
 */
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @SignedIn()
  @Get('notifications')
  list(@Query() query: ListNotificationsQueryDto): Promise<Page<AppNotification>> {
    return this.notifications.list(query);
  }

  @SignedIn()
  @Get('notifications/unread-count')
  unreadCount(): Promise<UnreadCount> {
    return this.notifications.unreadCount();
  }

  @SignedIn()
  @Post('notifications/read-all')
  @HttpCode(204)
  markAllRead(): Promise<void> {
    return this.notifications.markAllRead();
  }

  @SignedIn()
  @Post('notifications/:id/read')
  @HttpCode(204)
  markRead(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.notifications.markRead(id);
  }

  @SignedIn()
  @Get('push/public-key')
  publicKey(): { publicKey: string } {
    return this.notifications.publicKey();
  }

  @SignedIn()
  @Post('push-subscriptions')
  @HttpCode(201)
  subscribe(@Body() body: PushSubscriptionCreateDto): Promise<PushSubscription> {
    return this.notifications.subscribe(body);
  }

  @SignedIn()
  @Delete('push-subscriptions/:id')
  @HttpCode(204)
  unsubscribe(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.notifications.unsubscribe(id);
  }
}
