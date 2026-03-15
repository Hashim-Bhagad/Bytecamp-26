/**
 * TypeScript interfaces for the Auth Service API.
 *
 * CRITICAL: userEmail is the camelCase version of user_email from the backend.
 * If user_email is renamed in schema.sql without updating this interface,
 * userEmail becomes undefined at runtime. React renders undefined as blank — no error thrown.
 */

export interface UserDTO {
    id: number;
    userEmail: string;       // ← camelCase of user_email (SERIALIZES_TO edge, conf: 0.92)
    fullName3: string | null
    createdAt?: string;
    isActive: boolean;
}

export interface SessionDTO {
    sessionToken: string;
    userId: number;
    expiresAt: string;
}

export interface UserCreateDTO {
    userEmail: string;
    fullName3?: string
}

export interface ApiResponse<T> {
    data: T;
    success: boolean;
    message?: string;
}
