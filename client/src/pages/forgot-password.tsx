import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation } from "wouter";
import { passwordResetRequestSchema, passwordResetSchema, type PasswordResetRequest, type PasswordResetInput } from "@shared/schema";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { User, KeyRound, Eye, EyeOff, ArrowLeft, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type Step = "verify" | "reset" | "success";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("verify");
  const [verifiedUsername, setVerifiedUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const verifyForm = useForm<PasswordResetRequest>({
    resolver: zodResolver(passwordResetRequestSchema),
    defaultValues: {
      username: "",
    },
  });

  const resetForm = useForm({
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onVerifySubmit = async (data: PasswordResetRequest) => {
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/verify-username", data);
      const result = await res.json();
      if (result.success) {
        setVerifiedUsername(data.username);
        setStep("reset");
        toast({
          title: "Username verified",
          description: "You can now set a new password.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Verification failed",
        description: error?.message || "Username not found",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onResetSubmit = async (data: Omit<PasswordResetInput, "username">) => {
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", {
        username: verifiedUsername,
        newPassword: data.newPassword,
        confirmPassword: data.confirmPassword,
      });
      setStep("success");
      toast({
        title: "Password updated",
        description: "Your password has been reset successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Reset failed",
        description: error?.message || "Could not reset password",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-4">
              <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl font-bold">Password Reset Complete</CardTitle>
            <CardDescription>Your password has been updated successfully.</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              data-testid="button-back-to-login"
              className="w-full"
              onClick={() => setLocation("/login")}
            >
              Back to Sign in
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <CardTitle className="text-2xl font-bold">
                {step === "verify" ? "Forgot Password" : "Set New Password"}
              </CardTitle>
              <CardDescription>
                {step === "verify"
                  ? "Enter your username to reset your password"
                  : "Create a new password for your account"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        {step === "verify" && (
          <Form {...verifyForm}>
            <form onSubmit={verifyForm.handleSubmit(onVerifySubmit)}>
              <CardContent className="space-y-4">
                <FormField
                  control={verifyForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input
                          data-testid="input-username"
                          placeholder="Enter your username"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter>
                <Button
                  data-testid="button-verify"
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                  ) : (
                    <>
                      <User className="mr-2 h-4 w-4" />
                      Continue
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Form>
        )}

        {step === "reset" && (
          <Form {...resetForm}>
            <form onSubmit={resetForm.handleSubmit(onResetSubmit)}>
              <CardContent className="space-y-4">
                <FormField
                  control={resetForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            data-testid="input-new-password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter new password"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={resetForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            data-testid="input-confirm-password"
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="Confirm new password"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter>
                <Button
                  data-testid="button-reset-password"
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                  ) : (
                    <>
                      <KeyRound className="mr-2 h-4 w-4" />
                      Reset Password
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Form>
        )}
      </Card>
    </div>
  );
}
