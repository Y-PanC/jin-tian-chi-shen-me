"""Track one-time demo initialization without restoring deleted records."""
from alembic import op
import sqlalchemy as sa

revision = "d4e029a00001"
down_revision = "656070957178"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("demo_initializations",
                    sa.Column("dataset_id", sa.String(100), primary_key=True),
                    sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("completed_at", sa.Float(), nullable=False))


def downgrade():
    op.drop_table("demo_initializations")
