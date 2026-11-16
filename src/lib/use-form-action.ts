"use client";

import { startTransition, useActionState, type FormEvent } from "react";

/**
 * useActionState sem o reset automático do <form action>: o React 19 limpa o formulário
 * após qualquer envio, inclusive quando o servidor devolve erro de validação.
 */
export function useFormAction<S>(action: (state: S, form: FormData) => Promise<S>) {
  // Os estados das actions aceitam undefined como estado inicial
  const [state, dispatch, pending] = useActionState(action, undefined as Awaited<S>);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Inclui o botão clicado (name/value), para formulários com mais de uma ação
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const dados = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(dados));
  };
  return { state, pending, onSubmit };
}
