import type { Language } from '../types'

export interface Translations {
  brandName: string
  brandDescription: string
  heroEyebrow: string
  heroTitle: string
  themeSwitchLabel: string
  languageSwitchLabel: string
  day: string
  night: string
  english: string
  thai: string
  loadingLedger: string
  ledgerReady: string
  ledgerUnavailable: string
  transactionSaved: string
  transactionUpdated: string
  transactionDeleted: string
  retryLoadingLedger: string
  upgradeAccount: string
  accountUpgraded: string
  unableToUpgrade: string
  sessionMismatch: string
  transactionFormTitle: string
  action: string
  cardType: string
  customCardType: string
  price: string
  currency: string
  transactionDate: string
  save: string
  update: string
  clear: string
  loadingLatestRate: string
  usdToThb: (rate: string) => string
  approxThb: (amount: string) => string
  providerDate: (date: string) => string
  cachedRate: string
  canonicalThb: (amount: string) => string
  summaryTitle: string
  displayCurrency: string
  profit: string
  loss: string
  breakEven: string
  rateDate: (date: string) => string
  usdSummaryUnavailable: string
  transactionsTitle: string
  transactionTabs: string
  all: string
  buy: string
  sell: string
  noTransactions: (action: string) => string
  editAction: string
  deleteAction: string
  edit: (label: string) => string
  delete: (label: string) => string
  confirmDelete: string
  cancel: string
  actions: string
  unavailable: string
  email: string
  password: string
  sendVerificationEmail: string
  close: string
  verifiedEmail: string
  setPassword: string
  verificationSent: string
  verificationPending: string
  emailVerified: string
  emailAlreadyRegistered: string
  upgradeError: string
  priceRequired: string
  pricePositive: string
  dateFormat: string
  customCardTypeRequired: string
  rateRequired: string
  rateUnavailable: string
}

const english: Translations = {
  brandName: 'CardIO',
  brandDescription: 'Your card transaction tracker',
  heroEyebrow: 'CardIO',
  heroTitle: 'Track every card transaction clearly.',
  themeSwitchLabel: 'Theme',
  languageSwitchLabel: 'Language',
  day: 'DAY',
  night: 'NIGHT',
  english: 'EN',
  thai: 'ไทย',
  loadingLedger: 'Loading your ledger…',
  ledgerReady: 'Ledger ready.',
  ledgerUnavailable: 'Unable to load your ledger.',
  transactionSaved: 'Transaction saved.',
  transactionUpdated: 'Transaction updated.',
  transactionDeleted: 'Transaction deleted.',
  retryLoadingLedger: 'Retry loading ledger',
  upgradeAccount: 'Upgrade account',
  accountUpgraded: 'Account upgraded.',
  unableToUpgrade: 'Unable to upgrade your account.',
  sessionMismatch: 'The upgraded session did not match the current anonymous account. Please try again with the same account.',
  transactionFormTitle: 'Transaction form',
  action: 'Action',
  cardType: 'Card Type',
  customCardType: 'Custom card type',
  price: 'Price',
  currency: 'Currency',
  transactionDate: 'Transaction date',
  save: 'SAVE',
  update: 'UPDATE',
  clear: 'CLEAR',
  loadingLatestRate: 'Loading latest USD rate…',
  usdToThb: (rate) => `1 USD = ฿${rate} THB`,
  approxThb: (amount) => `≈ ฿${amount} THB`,
  providerDate: (date) => `Provider date: ${date}`,
  cachedRate: 'Cached rate',
  canonicalThb: (amount) => `Canonical THB amount: ฿${amount}`,
  summaryTitle: 'Ledger summary',
  displayCurrency: 'Display currency',
  profit: 'Profit',
  loss: 'Loss',
  breakEven: 'Break even',
  rateDate: (date) => `Rate date: ${date}`,
  usdSummaryUnavailable: 'USD summary unavailable until exchange rate loads.',
  transactionsTitle: 'Transactions',
  transactionTabs: 'Transaction tabs',
  all: 'All',
  buy: 'Buy',
  sell: 'Sell',
  noTransactions: (action) => `No ${action} transactions yet.`,
  editAction: 'EDIT',
  deleteAction: 'DELETE',
  edit: (label) => `Edit ${label}`,
  delete: (label) => `Delete ${label}`,
  confirmDelete: 'Confirm delete',
  cancel: 'Cancel',
  actions: 'Actions',
  unavailable: 'Unavailable',
  email: 'Email',
  password: 'Password',
  sendVerificationEmail: 'Send verification email',
  close: 'Close',
  verifiedEmail: "I've verified my email",
  setPassword: 'Set password',
  verificationSent: 'Verification email sent. Verify it, then continue to set your password.',
  verificationPending: 'Verification is still pending. Finish the email step and try again.',
  emailVerified: 'Email verified. Set a password to finish upgrading your account.',
  emailAlreadyRegistered: 'This email is already registered. Try another email address.',
  upgradeError: 'Something went wrong while upgrading the account.',
  priceRequired: 'Price is required.',
  pricePositive: 'Price must be greater than 0.',
  dateFormat: 'Transaction date must use YYYY-MM-DD.',
  customCardTypeRequired: 'Custom card type is required.',
  rateRequired: 'A USD to THB rate is required before saving.',
  rateUnavailable: 'Unable to load the USD to THB rate right now.',
}

const thai: Translations = {
  brandName: 'CardIO',
  brandDescription: 'ตัวติดตามธุรกรรมการ์ดของคุณ',
  heroEyebrow: 'CardIO',
  heroTitle: 'ติดตามธุรกรรมการ์ดได้อย่างชัดเจน',
  themeSwitchLabel: 'ธีม',
  languageSwitchLabel: 'ภาษา',
  day: 'กลางวัน',
  night: 'กลางคืน',
  english: 'EN',
  thai: 'ไทย',
  loadingLedger: 'กำลังโหลดบัญชีของคุณ…',
  ledgerReady: 'พร้อมใช้งาน',
  ledgerUnavailable: 'ไม่สามารถโหลดบัญชีของคุณได้',
  transactionSaved: 'บันทึกธุรกรรมแล้ว',
  transactionUpdated: 'อัปเดตธุรกรรมแล้ว',
  transactionDeleted: 'ลบธุรกรรมแล้ว',
  retryLoadingLedger: 'ลองโหลดบัญชีอีกครั้ง',
  upgradeAccount: 'อัปเกรดบัญชี',
  accountUpgraded: 'อัปเกรดบัญชีแล้ว',
  unableToUpgrade: 'ไม่สามารถอัปเกรดบัญชีได้',
  sessionMismatch: 'บัญชีที่อัปเกรดไม่ตรงกับบัญชีชั่วคราวปัจจุบัน กรุณาลองอีกครั้งด้วยบัญชีเดิม',
  transactionFormTitle: 'เพิ่มธุรกรรม',
  action: 'ประเภท',
  cardType: 'ประเภทการ์ด',
  customCardType: 'ประเภทการ์ดกำหนดเอง',
  price: 'ราคา',
  currency: 'สกุลเงิน',
  transactionDate: 'วันที่ทำรายการ',
  save: 'บันทึก',
  update: 'อัปเดต',
  clear: 'ล้าง',
  loadingLatestRate: 'กำลังโหลดอัตรา USD ล่าสุด…',
  usdToThb: (rate) => `1 USD = ฿${rate} THB`,
  approxThb: (amount) => `ประมาณ ฿${amount} THB`,
  providerDate: (date) => `วันที่จากผู้ให้บริการ: ${date}`,
  cachedRate: 'อัตราที่เก็บไว้',
  canonicalThb: (amount) => `ยอด THB หลัก: ฿${amount}`,
  summaryTitle: 'สรุปบัญชี',
  displayCurrency: 'สกุลเงินที่แสดง',
  profit: 'กำไร',
  loss: 'ขาดทุน',
  breakEven: 'เท่าทุน',
  rateDate: (date) => `วันที่อัตราแลกเปลี่ยน: ${date}`,
  usdSummaryUnavailable: 'ยังไม่สามารถแสดงยอด USD จนกว่าอัตราแลกเปลี่ยนจะโหลดเสร็จ',
  transactionsTitle: 'ธุรกรรม',
  transactionTabs: 'แท็บธุรกรรม',
  all: 'ทั้งหมด',
  buy: 'ซื้อ',
  sell: 'ขาย',
  noTransactions: (action) => `ยังไม่มีธุรกรรม${action}`,
  editAction: 'แก้ไข',
  deleteAction: 'ลบ',
  edit: (label) => `แก้ไข ${label}`,
  delete: (label) => `ลบ ${label}`,
  confirmDelete: 'ยืนยันการลบ',
  cancel: 'ยกเลิก',
  actions: 'จัดการ',
  unavailable: 'ไม่พร้อมใช้งาน',
  email: 'อีเมล',
  password: 'รหัสผ่าน',
  sendVerificationEmail: 'ส่งอีเมลยืนยัน',
  close: 'ปิด',
  verifiedEmail: 'ฉันยืนยันอีเมลแล้ว',
  setPassword: 'ตั้งรหัสผ่าน',
  verificationSent: 'ส่งอีเมลยืนยันแล้ว ยืนยันอีเมล แล้วตั้งรหัสผ่านต่อ',
  verificationPending: 'การยืนยันยังไม่เสร็จสิ้น ทำขั้นตอนอีเมลให้เสร็จแล้วลองอีกครั้ง',
  emailVerified: 'ยืนยันอีเมลแล้ว ตั้งรหัสผ่านเพื่ออัปเกรดบัญชีให้เสร็จ',
  emailAlreadyRegistered: 'อีเมลนี้ลงทะเบียนแล้ว ลองใช้อีเมลอื่น',
  upgradeError: 'เกิดข้อผิดพลาดขณะอัปเกรดบัญชี',
  priceRequired: 'กรุณาระบุราคา',
  pricePositive: 'ราคาต้องมากกว่า 0',
  dateFormat: 'วันที่ทำรายการต้องใช้รูปแบบ YYYY-MM-DD',
  customCardTypeRequired: 'กรุณาระบุประเภทการ์ดกำหนดเอง',
  rateRequired: 'ต้องมีอัตรา USD เป็น THB ก่อนบันทึก',
  rateUnavailable: 'ไม่สามารถโหลดอัตรา USD เป็น THB ได้ในขณะนี้',
}

export function getTranslations(language: Language): Translations {
  return language === 'th' ? thai : english
}
