export type { User } from '@/constants/mock-api-users';

export type UserFilters = {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sort?: string;
};

export type UsersResponse = {
  success: boolean;
  time: string;
  message: string;
  total_users: number;
  offset: number;
  limit: number;
  users: import('@/constants/mock-api-users').User[];
};

export type UserMutationPayload = {
  customer_name: string;
  contact: string;
  contact_phone: string;
  email: string;
  company_address: string;
  industry: string;
  source: string;
  owner: string;
  status: string;
  remark: string;
};
