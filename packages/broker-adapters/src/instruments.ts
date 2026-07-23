export const NSE_EQUITY_INSTRUMENTS = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', basePrice: 2850 },
  { symbol: 'TCS', name: 'Tata Consultancy Services Ltd', basePrice: 4100 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', basePrice: 1680 },
  { symbol: 'INFY', name: 'Infosys Ltd', basePrice: 1820 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', basePrice: 1240 },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd', basePrice: 2380 },
  { symbol: 'SBIN', name: 'State Bank of India', basePrice: 820 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', basePrice: 1580 },
  { symbol: 'ITC', name: 'ITC Ltd', basePrice: 460 },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank Ltd', basePrice: 1780 },
] as const;

export type MarketTick = {
  instrumentId: string;
  symbol: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
};
