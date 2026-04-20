import  { ConfigService } from "@nestjs/config";
import  { Response,  Request } from "express";

export class CookieHelper{
    // set access token cookie
    static setAccessTokenCookie(
        res: Response,
    token: string,
    configService: ConfigService,
    ): void{
        const isProduction = configService.getOrThrow<string>("NODE_ENV") === "production";
        const maxAge = 15 * 60 * 1000; // 15 minutes


        res.cookie("access_token", token, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'strict' : 'lax',
            maxAge,
            path:'/'
        })
    }


    // set refresh token cookie
    static setRefreshTokenCookie(res: Response, token: string, configService: ConfigService, rememberMe: boolean = false) {
            const isProduction = configService.get<string>('NODE_ENV') === 'production';

        const maxAge = rememberMe
            ? 90 * 24 * 60 * 60 * 1000 // 90 days
            : 7 * 24 * 60 * 60 * 1000; // 7 days
        
        res.cookie("refresh_token", token, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'strict' : 'lax',
            maxAge,
            path:'/'
        })
    }


    // clear both token cookies

    static clearTokenCookies(res: Response, configService: ConfigService): void {
        const isProduction = configService.get<string>('NODE_ENV') === 'production';

         res.clearCookie('access_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
         });
        
         res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
    });
        
    }
}