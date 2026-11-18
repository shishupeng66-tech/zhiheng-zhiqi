import type { PublicUser } from '@/lib/auth/types';
import type { User } from '@/features/users/api/types';

export const demoUser: PublicUser = {
  id: 'demo-admin',
  username: 'demo',
  name: '演示管理员',
  employeeNo: 'DEMO001',
  phone: null,
  department: '产品演示',
  position: '管理员',
  avatar: null,
  role: 'super_admin',
  status: 'active',
  mustChangePassword: false,
  createdAt: new Date('2026-01-01T00:00:00Z')
};

export const demoCustomers: User[] = [
  ['上海知行食品有限公司', '王伟', '上海', '食品饮料'],
  ['杭州青禾品牌管理有限公司', '李娜', '杭州', '品牌服务'],
  ['深圳星辰科技有限公司', '张敏', '深圳', '科技服务'],
  ['成都锦程商贸有限公司', '刘洋', '成都', '商贸零售'],
  ['北京启明文化有限公司', '陈静', '北京', '文化传媒']
].map(([customer_name, contact, city, industry], index) => ({
  id: index + 1,
  customer_name,
  contact,
  contact_phone: '示例号码',
  email: `demo${index + 1}@example.com`,
  company_address: `${city}市（示例地址）`,
  industry,
  source: '演示数据',
  owner: '演示管理员',
  status: '合作中',
  remark: '虚构示例，仅供产品演示',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z'
}));
