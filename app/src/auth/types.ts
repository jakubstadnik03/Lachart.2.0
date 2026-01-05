export type AuthUser = {
  _id: string;
  email?: string;
  name?: string;
  surname?: string;
  role?: 'admin' | 'coach' | 'athlete';
  admin?: boolean;
  athletes?: string[];
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};



