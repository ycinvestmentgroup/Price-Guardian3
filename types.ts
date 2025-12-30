
export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
  organization: string;
  lastLogin: string;
  is2FAEnabled: boolean;
}

export interface InvoiceItem {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  total: number;
  previousUnitPrice?: number;
  priceChange?: number; // absolute difference
  percentChange?: number;
}

export type DocumentType = 'invoice' | 'credit_note' | 'debit_note' | 'quote';

export interface Invoice {
  id: string;
  supplierName: string;
  date: string;
  dueDate: string;
  deliveryLocation?: string;
  invoiceNumber: string;
  totalAmount: number;
  gstAmount: number;
  bankAccount: string;
  creditTerm: string;
  address?: string;
  abn?: string;
  tel?: string;
  email?: string;
  docType: DocumentType;
  items: InvoiceItem[];
  status: 'matched' | 'price_increase' | 'price_decrease' | 'mixed' | 'new_supplier';
  fileName: string;
  isPaid: boolean;
  isHold: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  bankAccount?: string;
  address?: string;
  abn?: string;
  tel?: string;
  email?: string;
  creditTerm?: string;
  catalog: Record<string, number>; // itemName -> lastRecordedUnitPrice
}

export interface AppState {
  invoices: Invoice[];
  suppliers: Supplier[];
  loading: boolean;
  error: string | null;
  user: User | null;
}