import logging
import smtplib
from email.message import EmailMessage
from app.core.config import settings

logger = logging.getLogger(__name__)

def send_welcome_email(employee) -> bool:
    """
    Send a welcome email to the employee's personal email.
    Returns True if sent successfully, False otherwise.
    """
    if not settings.email_enabled:
        # Dev/no-creds mode: treat as a successful no-op so onboarding can complete
        # (the welcome step still stamps and reaches 100%). Set EMAIL_ENABLED=true
        # with real SMTP creds to actually deliver.
        logger.info(f"Email disabled. Would send welcome email to {employee.personal_email}")
        return True

    if not employee.personal_email:
        logger.error("No personal email address for employee")
        return False

    try:
        msg = EmailMessage()
        msg["Subject"] = f"Welcome to the team, {employee.first_name or 'New Employee'}!"
        msg["From"] = settings.smtp_from or settings.smtp_user
        msg["To"] = employee.personal_email
        msg.set_content(f"""
Dear {employee.first_name or 'Employee'},

Welcome to {employee.department.name if employee.department else 'our company'}!

We are excited to have you on board. Your onboarding is now complete.
Your employee code is: {employee.employee_code}
Your official email is: {employee.official_email}

Please contact HR if you have any questions.

Best regards,
HR Team
""")
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        logger.info(f"Welcome email sent to {employee.personal_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send welcome email: {e}")
        return False


def send_credentials_email(employee, plain_password: str) -> bool:
    """
    NEW — email the generated credentials to the employee's personal email.
    Returns True if sent (or logged, in dev mode) successfully, False otherwise.
    """
    if not settings.email_enabled:
        logger.info(f"Email disabled. Credentials for {employee.personal_email}: Password: {plain_password}")
        return True

    if not employee.personal_email:
        logger.error("No personal email for credentials invite")
        return False

    try:
        msg = EmailMessage()
        msg["Subject"] = "Welcome! Your HRMS Account Credentials"
        msg["From"] = settings.smtp_from or settings.smtp_user
        msg["To"] = employee.personal_email
        msg.set_content(f"""
Dear {employee.first_name or 'Employee'},

Your HR team has created your employee account. You can now log into the HRMS portal using the following credentials:

Login Email: {employee.official_email}
Password: {plain_password}

You can log in at the main Login page using either these credentials or by setting up Face Login upon your first access.

Best regards,
HR Team
""")
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        logger.info(f"Credentials email sent to {employee.personal_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send credentials email: {e}")
        return False

def send_offer_email(offer) -> bool:
    """
    Send an offer email to the candidate with Accept/Reject magic links.
    Returns True if sent successfully, False otherwise.
    """
    candidate = offer.candidate
    if not settings.email_enabled:
        logger.info(f"Email disabled. Would send offer email to {candidate.email} with offer_id {offer.id}")
        return True

    if not candidate.email:
        logger.error("No email address for candidate")
        return False

    try:
        msg = EmailMessage()
        msg["Subject"] = f"Job Offer from {settings.smtp_from or 'Our Company'}"
        msg["From"] = settings.smtp_from or settings.smtp_user
        msg["To"] = candidate.email
        
        frontend_url = "http://localhost:5173"  # In production, use environment variable
        accept_link = f"{frontend_url}/offer-response/{offer.id}?action=accept"
        reject_link = f"{frontend_url}/offer-response/{offer.id}?action=reject"
        
        # HTML Content
        html_content = f"""
        <html>
          <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
            <p>Dear {candidate.first_name or 'Candidate'},</p>
            <p>We are thrilled to offer you the position of <strong>{offer.designation}</strong>!</p>
            <p><strong>Offer Details:</strong></p>
            <ul>
              <li><strong>Designation:</strong> {offer.designation}</li>
              <li><strong>Salary:</strong> ₹{offer.salary:,.2f}</li>
              <li><strong>Start Date:</strong> {offer.start_date.strftime('%d %b %Y')}</li>
              <li><strong>Offer Expires:</strong> {offer.expires_at.strftime('%d %b %Y')}</li>
            </ul>
            <p>Please click one of the buttons below to respond to this offer:</p>
            
            <div style="margin: 30px 0;">
              <a href="{accept_link}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 15px; display: inline-block;">Accept Offer</a>
              
              <a href="{reject_link}" style="background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Decline Offer</a>
            </div>
            
            <p>If you have any questions, please reach out to us.</p>
            <p>Best regards,<br/>HR Team</p>
          </body>
        </html>
        """
        
        msg.set_content("Please enable HTML to view this email.")
        msg.add_alternative(html_content, subtype='html')

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
            
        logger.info(f"Offer email sent to {candidate.email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send offer email: {e}")
        return False