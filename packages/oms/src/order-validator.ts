import type { Instrument, ProductType } from '@paper-trading/db';

export class OrderValidator {
  validateProductForSegment(segment: Instrument['segment'], productType: ProductType): void {
    if (segment === 'EQUITY' && productType === 'NRML') {
      throw new Error('NRML is not valid for equity. Use CNC or MIS.');
    }
    if (segment !== 'EQUITY' && productType === 'CNC') {
      throw new Error('CNC is only valid for equity delivery.');
    }
    if (segment === 'EQUITY' && !['CNC', 'MIS'].includes(productType)) {
      throw new Error('Equity orders must use CNC or MIS.');
    }
    if (segment !== 'EQUITY' && !['NRML', 'MIS'].includes(productType)) {
      throw new Error('Derivatives must use NRML or MIS.');
    }
  }

  validateQuantity(instrument: Instrument, quantity: number): void {
    if (instrument.segment !== 'EQUITY' && quantity % instrument.lotSize !== 0) {
      throw new Error(`Quantity must be in multiples of lot size (${instrument.lotSize})`);
    }
    if (quantity <= 0) {
      throw new Error('Quantity must be positive');
    }
  }

  validateExpiry(instrument: Instrument): void {
    if (!instrument.expiry) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (instrument.expiry < today) {
      throw new Error('Cannot trade expired contract');
    }
  }
}
