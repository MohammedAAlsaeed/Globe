<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;

/**
 * Time-based one-time passwords (RFC 6238: HMAC-SHA1, 6 digits, 30-second
 * steps) — what Google Authenticator, Microsoft Authenticator, 1Password and
 * every other authenticator app produce. No third-party package: the
 * algorithm is a few lines, and keeping it here keeps it auditable.
 *
 * A code is accepted within one step either side (clock drift) and only
 * once: the step it was used in is remembered per user, so a code seen over
 * someone's shoulder can't be replayed.
 */
class Totp
{
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    private const PERIOD = 30;

    private const DIGITS = 6;

    /** A new random secret, base32 (160 bits, as RFC 4226 recommends). */
    public function newSecret(): string
    {
        return $this->base32(random_bytes(20));
    }

    /** The otpauth:// link an authenticator app scans (as a QR code). */
    public function uri(string $secret, string $account, string $issuer): string
    {
        return 'otpauth://totp/'.rawurlencode($issuer.':'.$account)
            .'?secret='.$secret.'&issuer='.rawurlencode($issuer).'&algorithm=SHA1&digits='.self::DIGITS.'&period='.self::PERIOD;
    }

    /** The code for a moment (Unix time). */
    public function code(string $secret, int $time): string
    {
        $counter = intdiv($time, self::PERIOD);
        $hash = hash_hmac('sha1', pack('N2', 0, $counter), $this->unbase32($secret), true);
        $offset = ord($hash[19]) & 0x0F;
        $value = ((ord($hash[$offset]) & 0x7F) << 24)
            | (ord($hash[$offset + 1]) << 16)
            | (ord($hash[$offset + 2]) << 8)
            | ord($hash[$offset + 3]);

        return str_pad((string) ($value % 10 ** self::DIGITS), self::DIGITS, '0', STR_PAD_LEFT);
    }

    /**
     * Whether `code` is right for now (±1 step) and wasn't used before.
     * `key` names whose codes these are (for replay protection).
     */
    public function verify(string $secret, string $code, string $key, ?int $now = null): bool
    {
        $code = preg_replace('/\s+/', '', $code) ?? '';
        if (! preg_match('/^\d{'.self::DIGITS.'}$/', $code)) {
            return false;
        }
        $now ??= time();
        $step = intdiv($now, self::PERIOD);
        $last = (int) Cache::get("totp-used:{$key}", -1);
        foreach ([0, -1, 1] as $drift) {
            $at = $step + $drift;
            if ($at <= $last) {
                continue;
            }
            if (hash_equals($this->code($secret, $at * self::PERIOD), $code)) {
                Cache::put("totp-used:{$key}", $at, now()->addMinutes(5));

                return true;
            }
        }

        return false;
    }

    private function base32(string $bytes): string
    {
        $bits = '';
        foreach (str_split($bytes) as $c) {
            $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
        }
        $out = '';
        foreach (str_split($bits, 5) as $chunk) {
            $out .= self::ALPHABET[bindec(str_pad($chunk, 5, '0'))];
        }

        return $out;
    }

    private function unbase32(string $text): string
    {
        $text = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $text) ?? '');
        $bits = '';
        foreach (str_split($text) as $c) {
            $bits .= str_pad(decbin((int) strpos(self::ALPHABET, $c)), 5, '0', STR_PAD_LEFT);
        }
        $out = '';
        foreach (str_split($bits, 8) as $byte) {
            if (strlen($byte) === 8) {
                $out .= chr(bindec($byte));
            }
        }

        return $out;
    }
}
