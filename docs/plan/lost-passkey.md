# Way back after a lost passkey

Status: planned. There is no way back.

## Problem

An account has only passkeys. Whoever loses all passkeys cannot get into the account any more. The same happens if the domain changes. Passkeys are bound to the domain `vok.cards`.

What exists today:
- A child can add more devices with an own passkey.
- The last passkey cannot be deleted.

## Goal

A child should get back into the account even if the passkey is gone. This also applies to a move to another domain.

## Open

- What does the way look like? The status named a recovery link. Who issues it, and how long is it valid?
- Who may trigger it? The children are young. The parents should be able to.
- How does the way itself stay safe? It must not become a new, easy way into foreign accounts.
- How is a new passkey bound to the old account without losing progress?
- What applies on a change of domain? Then all passkeys are useless.
- How does the way relate to `docs/plan/open-security-work.md` (sessions and passkeys)?
