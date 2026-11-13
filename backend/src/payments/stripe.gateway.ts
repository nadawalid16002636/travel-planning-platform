import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export interface GatewayPaymentIntent {
  id: string;
  clientSecret: string | null;
  status: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
}

export interface GatewayRefund {
  id: string;
  status: string | null;
  amount: number;
}

export interface GatewayEvent {
  id: string;
  type: string;
  intent: GatewayPaymentIntent;
}

/** Stripe test-mode calls. Card data never enters this class. PAY-01, PAY-03. */
@Injectable()
export class StripeGateway {
  private stripe?: Stripe;

  constructor(private readonly config: ConfigService) {}

  configured(): boolean {
    return Boolean(this.config.get<string>('STRIPE_SECRET_KEY'));
  }

  private client(): Stripe {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!key) {
      throw new ServiceUnavailableException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY (test mode) in backend/.env',
      );
    }
    this.stripe ??= new Stripe(key);
    return this.stripe;
  }

  async createPaymentIntent(input: {
    amount: number;
    currency: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<GatewayPaymentIntent> {
    const intent = await this.client().paymentIntents.create(
      {
        amount: input.amount,
        currency: input.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: input.metadata,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return this.mapIntent(intent);
  }

  async retrievePaymentIntent(id: string): Promise<GatewayPaymentIntent> {
    return this.mapIntent(await this.client().paymentIntents.retrieve(id));
  }

  async cancelPaymentIntent(id: string): Promise<void> {
    try {
      await this.client().paymentIntents.cancel(id);
    } catch (error) {
      if (this.alreadyCanceled(error)) return;
      throw error;
    }
  }

  async createRefund(input: {
    paymentIntentId: string;
    amount: number;
    idempotencyKey: string;
  }): Promise<GatewayRefund> {
    const refund = await this.client().refunds.create(
      { payment_intent: input.paymentIntentId, amount: input.amount },
      { idempotencyKey: input.idempotencyKey },
    );
    return { id: refund.id, status: refund.status, amount: refund.amount };
  }

  constructEvent(rawBody: Buffer, signature: string): GatewayEvent {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException(
        'Stripe webhook secret is not configured. Set STRIPE_WEBHOOK_SECRET in backend/.env',
      );
    }
    const event = this.client().webhooks.constructEvent(rawBody, signature, secret);
    const intent = event.data.object as Stripe.PaymentIntent;
    return { id: event.id, type: event.type, intent: this.mapIntent(intent) };
  }

  signatureError(error: unknown): boolean {
    return error instanceof Stripe.errors.StripeSignatureVerificationError;
  }

  /** Card and request errors will not succeed on the next poll. Network errors will. */
  permanentError(error: unknown): boolean {
    return (
      error instanceof Stripe.errors.StripeInvalidRequestError ||
      error instanceof Stripe.errors.StripeCardError
    );
  }

  private alreadyCanceled(error: unknown): boolean {
    return (
      error instanceof Stripe.errors.StripeInvalidRequestError &&
      /canceled|cancelled/i.test(error.message)
    );
  }

  private mapIntent(intent: Stripe.PaymentIntent): GatewayPaymentIntent {
    return {
      id: intent.id,
      clientSecret: intent.client_secret,
      status: intent.status,
      amount: intent.amount,
      currency: intent.currency,
      metadata: intent.metadata ?? {},
    };
  }
}
