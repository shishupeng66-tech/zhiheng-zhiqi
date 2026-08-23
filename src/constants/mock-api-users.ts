////////////////////////////////////////////////////////////////////////////////
// 🛑 Nothing in here has anything to do with Nextjs, it's just a fake database
////////////////////////////////////////////////////////////////////////////////

import { faker } from '@faker-js/faker';
import { matchSorter } from 'match-sorter';
import { delay } from '@/lib/delay';

export type User = {
  id: number;
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
  created_at: string;
  updated_at: string;
};

function generateRandomUserData(id: number): User {
  const industries = ['互联网', '制造业', '金融', '教育', '医疗健康', '零售电商', '其他'];
  const sources = ['官网', '转介绍', '展会', '广告投放', '电话营销', '其他'];
  const statuses = ['潜在', '跟进中', '已成交', '已流失'];
  const owners = ['张伟', '李娜', '王强', '刘洋', '陈静'];

  return {
    id,
    customer_name: faker.company.name(),
    contact: faker.person.fullName(),
    contact_phone: faker.phone.number({ style: 'national' }),
    email: faker.internet.email(),
    company_address: `${faker.location.city()}市${faker.location.street()}`,
    industry: faker.helpers.arrayElement(industries),
    source: faker.helpers.arrayElement(sources),
    owner: faker.helpers.arrayElement(owners),
    status: faker.helpers.arrayElement(statuses),
    remark: (faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.4 }) ??
      '') as string,
    created_at: faker.date.between({ from: '2022-01-01', to: '2023-12-31' }).toISOString(),
    updated_at: faker.date.recent().toISOString()
  };
}

// Mock user data store
export const fakeUsers = {
  records: [] as User[],

  initialize() {
    const sampleUsers: User[] = [];
    for (let i = 1; i <= 50; i++) {
      sampleUsers.push(generateRandomUserData(i));
    }

    this.records = sampleUsers;
  },

  async getAll({ status, search }: { status?: string; search?: string }) {
    let users = [...this.records];

    if (status) {
      const statusList = String(status).split(/[.,]/);
      users = users.filter((user) => statusList.includes(user.status));
    }

    if (search) {
      users = matchSorter(users, search, {
        keys: ['customer_name', 'contact', 'email']
      });
    }

    return users;
  },

  async createUser(data: Omit<User, 'id' | 'created_at' | 'updated_at'>) {
    await delay(800);

    const newUser: User = {
      ...data,
      id: this.records.length + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.records.push(newUser);

    return {
      success: true,
      message: '客户创建成功',
      user: newUser
    };
  },

  async updateUser(id: number, data: Omit<User, 'id' | 'created_at' | 'updated_at'>) {
    await delay(800);

    const index = this.records.findIndex((user) => user.id === id);

    if (index === -1) {
      return { success: false, message: `User with ID ${id} not found` };
    }

    this.records[index] = {
      ...this.records[index],
      ...data,
      updated_at: new Date().toISOString()
    };

    return {
      success: true,
      message: '客户更新成功',
      user: this.records[index]
    };
  },

  async deleteUser(id: number) {
    await delay(800);

    const index = this.records.findIndex((user) => user.id === id);

    if (index === -1) {
      return { success: false, message: `User with ID ${id} not found` };
    }

    this.records.splice(index, 1);

    return {
      success: true,
      message: '客户删除成功'
    };
  },

  async getUsers({
    page = 1,
    limit = 10,
    status,
    search,
    sort
  }: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    sort?: string;
  }) {
    await delay(800);

    const allUsers = await this.getAll({
      status,
      search
    });

    // Sorting
    if (sort) {
      try {
        const sortItems = JSON.parse(sort) as {
          id: string;
          desc: boolean;
        }[];
        if (sortItems.length > 0) {
          const { id, desc } = sortItems[0];
          allUsers.sort((a, b) => {
            // Handle computed 'name' column
            const aVal = id === 'name' ? a.customer_name : (a as Record<string, unknown>)[id];
            const bVal = id === 'name' ? b.customer_name : (b as Record<string, unknown>)[id];
            if (typeof aVal === 'number' && typeof bVal === 'number') {
              return desc ? bVal - aVal : aVal - bVal;
            }
            const aStr = String(aVal ?? '').toLowerCase();
            const bStr = String(bVal ?? '').toLowerCase();
            return desc ? bStr.localeCompare(aStr) : aStr.localeCompare(bStr);
          });
        }
      } catch {
        // Invalid sort param — ignore
      }
    }

    const totalUsers = allUsers.length;

    const offset = (page - 1) * limit;
    const paginatedUsers = allUsers.slice(offset, offset + limit);

    return {
      success: true,
      time: new Date().toISOString(),
      message: '用于测试与学习的示例数据',
      total_users: totalUsers,
      offset,
      limit,
      users: paginatedUsers
    };
  }
};

fakeUsers.initialize();
