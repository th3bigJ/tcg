export type CustomerProfileShareStatus =
  | "pending_recipient"
  | "pending_accept"
  | "active"
  | "declined"
  | "revoked";

export type CustomerProfileShareRow = {
  id: string;
  ownerCustomerId: number;
  recipientCustomerId: number | null;
  recipientEmail: string;
  status: CustomerProfileShareStatus;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

export type CustomerPublic = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

export function normalizeShareEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function displayCustomerName(c: Pick<CustomerPublic, "firstName" | "lastName" | "email">): string {
  const name = `${c.firstName} ${c.lastName}`.trim();
  return name || c.email;
}
