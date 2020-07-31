
/** Base Gun wrapper error. */
export class GunError extends Error {}

/** Base error related to the network. */
export class NetworkError extends GunError {}

/** Timeout error. */
export class TimeoutError extends NetworkError {
    constructor(...args: any) {
        super(...withDefaultMessage(args, 'The operation timed out'));
    }
}

/** Base error related to authentication. */
export class AuthError extends GunError {}

/** Attempting to start another login while another is in progress. */
export class MultipleAuthError extends AuthError {}

/** Login error. */
export class InvalidCredentials extends AuthError {}

/** User creation error. */
export class UserExists extends AuthError {}

const withDefaultMessage = (args: any[], defaultMessage: string) => {
    if (args.length === 0 || args.length === 1 && !args[0]) {
        args = [defaultMessage];
    }
    return args;
}
