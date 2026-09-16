'use client';

import { isSupabaseEnabled } from '@/lib/supabase/config';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/providers/auth-provider';
import type { UserProfile } from '@/lib/types';

const notificationOptions = [
  { id: 'order-updates', label: 'Order status updates', defaultChecked: true },
  { id: 'live-links', label: 'Email me when a placement goes live', defaultChecked: true },
  { id: 'new-inventory', label: 'New websites in my saved niches', defaultChecked: false },
  { id: 'product-news', label: 'Product news and benchmarks', defaultChecked: false },
];

export function AccountForm({ user }: { user: UserProfile }) {
  const { signOut } = useAuth();
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState({
    fullName: user.fullName,
    email: user.email,
    company: user.company ?? '',
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="account-name">Full name</Label>
            <Input
              id="account-name"
              value={profile.fullName}
              onChange={(event) => setProfile({ ...profile, fullName: event.target.value })}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="account-email">Email</Label>
            <Input
              id="account-email"
              type="email"
              value={profile.email}
              onChange={(event) => setProfile({ ...profile, email: event.target.value })}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="account-company">Company</Label>
            <Input
              id="account-company"
              value={profile.company}
              onChange={(event) => setProfile({ ...profile, company: event.target.value })}
              className="mt-1.5"
            />
          </div>
        </CardContent>
        <CardFooter className="flex items-center justify-between">
          <Button
            size="sm"
            onClick={() => {
              setSaved(true);
              window.setTimeout(() => setSaved(false), 2500);
            }}
          >
            Save changes
          </Button>
          {saved ? (
            <span
              role="status"
              className="flex items-center gap-1.5 text-[12px] font-medium text-accent-700"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Saved locally
            </span>
          ) : null}
        </CardFooter>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Email notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {notificationOptions.map((option) => (
              <div key={option.id} className="flex items-center gap-2.5">
                <Checkbox id={option.id} defaultChecked={option.defaultChecked} />
                <label htmlFor={option.id} className="cursor-pointer text-[13px] text-ink-soft">
                  {option.label}
                </label>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isSupabaseEnabled() ? null : (
              <p className="text-[13px] text-muted">
                Sign-in is running without a database on this environment, so any address signs in
                and creates a demo account.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => signOut()}>
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
