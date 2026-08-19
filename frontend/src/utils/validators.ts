export function isAllDigits(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    if (str[i] < '0' || str[i] > '9') return false;
  }
  return true;
}

export function isValidEmail(value: string): boolean {
  const parts = value.trim().split('@');
  if (parts.length !== 2) return false;
  if (!parts[1].includes('.')) return false;
  if (parts[0].length === 0 || parts[1].length < 3) return false;
  return true;
}

export function validateEmployeeForm(form: Record<string, any>, isEditMode = false) {
  const errors: Record<string, string> = {};

  const checkRequired = (val: string | undefined | null) => {
    if (isEditMode) return true; // Skip required checks in edit mode, let backend handle partial updates
    return Boolean(val?.trim());
  };

  // Step 0: Basic
  if (!checkRequired(form.first_name)) errors.first_name = "First name is required";
  else if (form.first_name?.trim() === "") {
    if (!isEditMode) errors.first_name = "First name is required";
  }
  
  if (!checkRequired(form.last_name)) errors.last_name = "Last name is required";
  
  if (!checkRequired(form.personal_email)) errors.personal_email = "Personal email is required";
  else if (form.personal_email?.trim() && !isValidEmail(form.personal_email)) errors.personal_email = "Enter a valid email address";
  
  if (form.official_email?.trim() && !isValidEmail(form.official_email)) {
    errors.official_email = "Enter a valid email address";
  }

  if (!checkRequired(form.phone)) errors.phone = "Phone number is required";
  else if (form.phone?.trim()) {
    const v = form.phone.replace(/[\s-]/g, "");
    if (!isAllDigits(v) || v.length !== 10) errors.phone = "Must be exactly 10 digits";
  }

  if (!checkRequired(form.dob)) errors.dob = "Date of birth is required";
  else if (form.dob?.trim()) {
    const dobDate = new Date(form.dob);
    const today = new Date();
    let age = today.getFullYear() - dobDate.getFullYear();
    const m = today.getMonth() - dobDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) age--;
    if (age < 18) errors.dob = "Employee must be at least 18 years old";
  }

  if (!checkRequired(form.gender)) errors.gender = "Gender is required";

  // Step 1: Employment
  if (!isEditMode && !form.joining_date) errors.joining_date = "Joining date is required";
  if (!checkRequired(form.designation_id)) errors.designation_id = "Designation is required";

  // Step 2: Address
  if (!checkRequired(form.address)) errors.address = "Address is required";
  if (!checkRequired(form.city)) errors.city = "City is required";
  if (!checkRequired(form.zip_code)) errors.zip_code = "Zip code is required";
  else if (form.zip_code?.trim()) {
    const v = form.zip_code.trim();
    if (!isAllDigits(v) || v.length !== 6) errors.zip_code = "Must be exactly 6 digits";
  }

  // Step 4: Banking
  if (!checkRequired(form.bank_account_number)) errors.bank_account_number = "Bank account number is required";
  else if (form.bank_account_number?.trim()) {
    const v = form.bank_account_number.replace(/[\s-]/g, "");
    if (!isAllDigits(v) || v.length < 9 || v.length > 12) {
      errors.bank_account_number = "Must be between 9 and 12 digits";
    }
  }

  if (!checkRequired(form.ifsc_code)) errors.ifsc_code = "IFSC code is required";
  else if (form.ifsc_code?.trim()) {
    const v = form.ifsc_code.trim().toUpperCase();
    let valid = true;
    if (v.length !== 11 || v[4] !== '0') valid = false;
    for (let i = 0; i < 4 && valid; i++) if (v[i] < 'A' || v[i] > 'Z') valid = false;
    for (let i = 5; i < 11 && valid; i++) {
        const c = v[i];
        if (!((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9'))) valid = false;
    }
    if (!valid) errors.ifsc_code = "Invalid IFSC code format";
  }

  if (!checkRequired(form.bank_branch)) errors.bank_branch = "Bank branch is required";

  if (!checkRequired(form.pan_number)) errors.pan_number = "PAN number is required";
  else if (form.pan_number?.trim()) {
    const v = form.pan_number.trim().toUpperCase();
    let valid = true;
    if (v.length !== 10) valid = false;
    for (let i = 0; i < 5 && valid; i++) if (v[i] < 'A' || v[i] > 'Z') valid = false;
    for (let i = 5; i < 9 && valid; i++) if (v[i] < '0' || v[i] > '9') valid = false;
    if (valid && (v[9] < 'A' || v[9] > 'Z')) valid = false;
    if (!valid) errors.pan_number = "Invalid PAN number format (e.g. ABCDE1234F)";
  }

  if (!checkRequired(form.aadhaar_number)) errors.aadhaar_number = "Aadhaar number is required";
  else if (form.aadhaar_number?.trim()) {
    const v = form.aadhaar_number.replace(/[\s-]/g, "");
    if (!isAllDigits(v) || v.length !== 12) errors.aadhaar_number = "Must be exactly 12 digits";
  }

  if (form.uan_number?.trim()) {
    const v = form.uan_number.replace(/[\s-]/g, "");
    if (!isAllDigits(v) || v.length !== 12) errors.uan_number = "Must be exactly 12 digits";
  }

  return errors;
}
