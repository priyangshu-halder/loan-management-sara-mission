"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Lock, User, Building2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";

export default function LoginPage() {
  const router = useRouter();
  const [organizationCode, setOrganizationCode] = useState("RAYHAN-MFI");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("Admin@12345");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationCode: organizationCode.trim().toUpperCase(),
          username: username.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data?.error?.message || "Invalid credentials. Please try again.");
        setIsLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      console.error("Login submission error:", err);
      setErrorMessage("Network error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 text-white font-extrabold text-xl shadow-md mb-3">
            ₹
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Rayhan Microfinance ERP
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Sign in to your staff portal account
          </p>
        </div>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Staff Authentication</CardTitle>
            <CardDescription>
              Enter your assigned organization code and staff credentials
            </CardDescription>
          </CardHeader>
          <CardContent>
            {errorMessage && (
              <div
                role="alert"
                className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium"
              >
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Input
                  label="Organization Code"
                  placeholder="e.g. RAYHAN-MFI"
                  value={organizationCode}
                  onChange={(e) => setOrganizationCode(e.target.value)}
                  required
                />
                <Building2 className="absolute right-3 top-8 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>

              <div className="relative">
                <Input
                  label="Username"
                  placeholder="e.g. admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
                <User className="absolute right-3 top-8 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>

              <div className="relative">
                <Input
                  type="password"
                  label="Password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Lock className="absolute right-3 top-8 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>

              <Button type="submit" isLoading={isLoading} className="w-full mt-2">
                <ShieldCheck className="h-4 w-4 mr-1.5" />
                Sign In Securely
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
              <p>Demo Admin Credentials:</p>
              <p className="mt-1 font-mono text-slate-700 font-medium">
                Org: RAYHAN-MFI | User: admin | Pass: Admin@12345
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

