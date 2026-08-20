import { useEffect, useState } from "react";
import { Camera, LoaderCircle, LogIn, MapPin, Pencil, Plus, Star, Trash2, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import CommerceHeader from "@/components/CommerceHeader";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import type { RouterOutputs } from "@/lib/trpc";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Гүйцэтгэж чадсангүй. Дахин оролдоно уу.";

type AddressRow = RouterOutputs["profile"]["addresses"]["list"][number];

const emptyAddressForm = { label: "", recipientName: "", phone: "", addressLine: "", isDefault: false };

function AddressForm({ initial, onCancel, onSubmit, isSubmitting }: {
  initial: typeof emptyAddressForm;
  onCancel: () => void;
  onSubmit: (value: typeof emptyAddressForm) => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState(initial);
  return (
    <form
      className="address-form"
      onSubmit={event => {
        event.preventDefault();
        if (!form.label.trim() || !form.recipientName.trim() || !form.phone.trim() || !form.addressLine.trim()) {
          toast.error("Бүх талбарыг бөглөнө үү.");
          return;
        }
        onSubmit(form);
      }}
    >
      <div className="profile-form-grid">
        <label className="auth-field">
          Хаягийн нэр (жишээ: Гэр, Ажил)
          <div className="auth-field-shell"><input value={form.label} onChange={event => setForm(current => ({ ...current, label: event.target.value }))} placeholder="Гэр" maxLength={60} /></div>
        </label>
        <label className="auth-field">
          Хүлээн авагчийн нэр
          <div className="auth-field-shell"><input value={form.recipientName} onChange={event => setForm(current => ({ ...current, recipientName: event.target.value }))} placeholder="Таны нэр" maxLength={160} /></div>
        </label>
        <label className="auth-field">
          Утас
          <div className="auth-field-shell"><input value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} placeholder="9911 2233" inputMode="tel" maxLength={40} /></div>
        </label>
        <label className="auth-field" style={{ gridColumn: "1 / -1" }}>
          Дэлгэрэнгүй хаяг
          <div className="auth-field-shell"><textarea value={form.addressLine} onChange={event => setForm(current => ({ ...current, addressLine: event.target.value }))} placeholder="Дүүрэг, хороо, байр, орц, тоот" style={{ minHeight: "70px", padding: "10px 0" }} maxLength={2000} /></div>
        </label>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 700 }}>
        <input type="checkbox" checked={form.isDefault} onChange={event => setForm(current => ({ ...current, isDefault: event.target.checked }))} style={{ accentColor: "var(--primary)" }} />
        Үндсэн хаяг болгох
      </label>
      <div className="address-form-actions">
        <button type="submit" disabled={isSubmitting} className="button button-primary">{isSubmitting && <LoaderCircle className="animate-spin" size={14} />} Хадгалах</button>
        <button type="button" onClick={onCancel} className="auth-quiet" style={{ width: "auto" }}>Цуцлах</button>
      </div>
    </form>
  );
}

export default function Profile() {
  const { user, loading, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [addingAddress, setAddingAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);

  useEffect(() => {
    setName(user?.name ?? "");
    setPhone(user?.phone ?? "");
  }, [user?.name, user?.phone]);

  const addresses = trpc.profile.addresses.list.useQuery(undefined, { enabled: isAuthenticated });
  const updateProfile = trpc.profile.update.useMutation({
    onSuccess: () => { utils.auth.me.invalidate(); toast.success("Профайл шинэчлэгдлээ."); },
    onError: error => toast.error(messageFrom(error)),
  });
  const uploadAvatar = trpc.profile.uploadAvatar.useMutation({
    onSuccess: () => { utils.auth.me.invalidate(); toast.success("Зураг шинэчлэгдлээ."); },
    onError: error => toast.error(messageFrom(error)),
  });
  const removeAvatar = trpc.profile.removeAvatar.useMutation({
    onSuccess: () => { utils.auth.me.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });
  const createAddress = trpc.profile.addresses.create.useMutation({
    onSuccess: () => { utils.profile.addresses.list.invalidate(); setAddingAddress(false); toast.success("Хаяг нэмэгдлээ."); },
    onError: error => toast.error(messageFrom(error)),
  });
  const updateAddress = trpc.profile.addresses.update.useMutation({
    onSuccess: () => { utils.profile.addresses.list.invalidate(); setEditingAddressId(null); toast.success("Хаяг шинэчлэгдлээ."); },
    onError: error => toast.error(messageFrom(error)),
  });
  const deleteAddress = trpc.profile.addresses.delete.useMutation({
    onSuccess: () => { utils.profile.addresses.list.invalidate(); toast.success("Хаяг устгагдлаа."); },
    onError: error => toast.error(messageFrom(error)),
  });

  const onAvatarSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024) {
      toast.error("JPG, PNG, WEBP форматтай, 4 MB-аас бага зураг сонгоно уу.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      uploadAvatar.mutate({ fileName: file.name, contentType: file.type as "image/jpeg" | "image/png" | "image/webp", dataBase64: String(reader.result) });
    };
    reader.readAsDataURL(file);
  };

  const saveProfile = (event: React.FormEvent) => {
    event.preventDefault();
    updateProfile.mutate({ name: name.trim() || null, phone: phone.trim() || null });
  };

  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "?";
  const editingAddress = editingAddressId ? addresses.data?.find(item => item.id === editingAddressId) : null;

  if (!loading && !isAuthenticated) {
    return (
      <div className="sugi-commerce" style={{ overflow: "visible" }}>
        <CommerceHeader backLabel="SUGI ASAYAKE профайл" />
        <main className="profile-main">
          <section className="orders-gate">
            <LogIn size={24} style={{ margin: "0 auto" }} />
            <h2>Профайлаа харахын тулд нэвтэрнэ үү.</h2>
            <p>Хувийн мэдээлэл, зураг болон хүргэлтийн хаягаа энд хадгалж болно.</p>
            <button type="button" onClick={startLogin} className="button button-primary" style={{ marginTop: "24px" }}>Нэвтрэх</button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="sugi-commerce" style={{ overflow: "visible" }}>
      <CommerceHeader backLabel="SUGI ASAYAKE профайл" />
      <main className="profile-main">
        <div className="profile-head">
          <div className="profile-avatar">
            <div className="profile-avatar-circle">
              {uploadAvatar.isPending ? <LoaderCircle className="animate-spin" size={22} /> : user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initial}
            </div>
            <label className="profile-avatar-edit" aria-label="Зураг солих">
              <Camera size={14} />
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onAvatarSelected} disabled={uploadAvatar.isPending} />
            </label>
          </div>
          <div className="profile-head-copy">
            <h1>{user?.name?.trim() || "Нэргүй хэрэглэгч"}</h1>
            <p>{user?.email}</p>
            {user?.avatarUrl && <button type="button" onClick={() => removeAvatar.mutate()} disabled={removeAvatar.isPending} className="profile-avatar-remove">Зураг хасах</button>}
          </div>
        </div>

        <div className="profile-grid">
          <section className="profile-section">
            <div className="profile-section-head">
              <div>
                <h2>Хувийн мэдээлэл</h2>
                <p>Нэр болон хүргэлтэд хэрэглэх утасны дугаар</p>
              </div>
            </div>
            <form onSubmit={saveProfile} className="profile-form-grid">
              <label className="auth-field">
                Нэр
                <div className="auth-field-shell"><UserIcon size={16} aria-hidden="true" /><input value={name} onChange={event => setName(event.target.value)} placeholder="Таны нэр" maxLength={160} /></div>
              </label>
              <label className="auth-field">
                Утас
                <div className="auth-field-shell"><input value={phone} onChange={event => setPhone(event.target.value)} placeholder="9911 2233" inputMode="tel" maxLength={40} /></div>
              </label>
              <label className="auth-field" style={{ gridColumn: "1 / -1" }}>
                Имэйл
                <div className="auth-field-shell" style={{ opacity: .6 }}><input value={user?.email ?? ""} disabled readOnly /></div>
              </label>
              <div style={{ gridColumn: "1 / -1" }}>
                <button type="submit" disabled={updateProfile.isPending} className="button button-primary">
                  {updateProfile.isPending && <LoaderCircle className="animate-spin" size={15} />} Хадгалах
                </button>
              </div>
            </form>
          </section>

          <section className="profile-section">
            <div className="profile-section-head">
              <div>
                <h2>Хүргэлтийн хаяг</h2>
                <p>Захиалга хийхэд үндсэн хаяг автоматаар бөглөгдөнө</p>
              </div>
              {!addingAddress && <button type="button" onClick={() => { setEditingAddressId(null); setAddingAddress(true); }} className="address-add-button"><Plus size={14} /> Хаяг нэмэх</button>}
            </div>

            {addresses.isLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#77787c", fontSize: "13px" }}><LoaderCircle className="animate-spin" size={16} /> Ачааллаж байна…</div>
            ) : (
              <div className="profile-address-list">
                {addresses.data?.length ? addresses.data.map((address: AddressRow) => (
                  editingAddressId === address.id ? (
                    <AddressForm
                      key={address.id}
                      initial={{ label: address.label, recipientName: address.recipientName, phone: address.phone, addressLine: address.addressLine, isDefault: address.isDefault }}
                      isSubmitting={updateAddress.isPending}
                      onCancel={() => setEditingAddressId(null)}
                      onSubmit={value => updateAddress.mutate({ id: address.id, ...value })}
                    />
                  ) : (
                    <div key={address.id} className={`address-card${address.isDefault ? " is-default" : ""}`}>
                      <div className="address-card-head">
                        <MapPin size={15} style={{ color: "var(--primary)" }} />
                        <strong>{address.label}</strong>
                        {address.isDefault && <span className="address-default-badge">ҮНДСЭН</span>}
                      </div>
                      <p>{address.recipientName} · {address.phone}<br />{address.addressLine}</p>
                      <div className="address-card-actions">
                        {!address.isDefault && <button type="button" onClick={() => updateAddress.mutate({ id: address.id, isDefault: true })}><Star size={13} /> Үндсэн болгох</button>}
                        <button type="button" onClick={() => { setAddingAddress(false); setEditingAddressId(address.id); }}><Pencil size={13} /> Засах</button>
                        <button type="button" className="danger" onClick={() => { if (window.confirm("Энэ хаягийг устгах уу?")) deleteAddress.mutate({ id: address.id }); }}><Trash2 size={13} /> Устгах</button>
                      </div>
                    </div>
                  )
                )) : !addingAddress && <div className="address-empty">Хадгалсан хаяг алга байна. Захиалга хийхдээ дахин бичихгүйн тулд эндээс нэмээрэй.</div>}

                {addingAddress && (
                  <AddressForm
                    initial={emptyAddressForm}
                    isSubmitting={createAddress.isPending}
                    onCancel={() => setAddingAddress(false)}
                    onSubmit={value => createAddress.mutate(value)}
                  />
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
