import React from 'react';
import {
  Box,
  Skeleton,
  Paper,
  List,
  ListItem,
  ListItemText,
  Card,
  CardContent,
  Grid,
} from '@mui/material';

export const VideoListSkeleton: React.FC = () => (
  <Paper>
    <List>
      {[1, 2, 3, 4, 5].map((item) => (
        <ListItem key={item} sx={{ py: 2 }}>
          <ListItemText
            primary={<Skeleton variant="text" width="60%" />}
            secondary={
              <Box component="div" display="flex" flexDirection="column" gap={1} mt={1}>
                <Box display="flex" alignItems="center" gap={1}>
                  <Skeleton variant="rectangular" width={80} height={24} sx={{ borderRadius: 1 }} />
                  <Skeleton variant="text" width={100} />
                </Box>
              </Box>
            }
          />
          <Box sx={{ display: 'flex', gap: 1, ml: 2 }}>
            <Skeleton variant="circular" width={40} height={40} />
            <Skeleton variant="circular" width={40} height={40} />
          </Box>
        </ListItem>
      ))}
    </List>
  </Paper>
);

export const SceneEditorSkeleton: React.FC = () => (
  <Box>
    {[1, 2, 3].map((scene) => (
      <Paper key={scene} sx={{ p: 3, mb: 2 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Skeleton variant="text" width={120} height={32} />
          <Skeleton variant="rectangular" width={60} height={24} sx={{ borderRadius: 1 }} />
        </Box>
        <Box mb={3}>
          <Skeleton variant="text" width={150} sx={{ mb: 1 }} />
          <Skeleton variant="rectangular" width="100%" height={80} sx={{ borderRadius: 1 }} />
        </Box>
        <Grid container spacing={2}>
          {[1, 2, 3].map((video) => (
            <Grid item xs={12} sm={6} md={4} key={video}>
              <Card>
                <Skeleton variant="rectangular" width="100%" height={120} />
              </Card>
            </Grid>
          ))}
        </Grid>
      </Paper>
    ))}
  </Box>
);

export const TTSAudioListSkeleton: React.FC = () => (
  <List>
    {[1, 2, 3].map((item) => (
      <React.Fragment key={item}>
        <ListItem sx={{ px: 0 }}>
          <ListItemText
            primary={<Skeleton variant="text" width="80%" />}
            secondary={
              <Box sx={{ mt: 1 }}>
                <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                  <Skeleton variant="rectangular" width={60} height={20} sx={{ borderRadius: 1 }} />
                  <Skeleton variant="rectangular" width={40} height={20} sx={{ borderRadius: 1 }} />
                  <Skeleton variant="rectangular" width={50} height={20} sx={{ borderRadius: 1 }} />
                </Box>
                <Skeleton variant="text" width={120} />
              </Box>
            }
          />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Skeleton variant="circular" width={32} height={32} />
            <Skeleton variant="circular" width={32} height={32} />
            <Skeleton variant="circular" width={32} height={32} />
          </Box>
        </ListItem>
      </React.Fragment>
    ))}
  </List>
);

export const VideoCreatorSceneSkeleton: React.FC = () => (
  <Paper sx={{ p: 3, mb: 3 }}>
    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
      <Skeleton variant="text" width={100} height={32} />
      <Skeleton variant="circular" width={40} height={40} />
    </Box>
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Skeleton variant="rectangular" width="100%" height={80} sx={{ borderRadius: 1 }} />
      </Grid>
      <Grid item xs={12}>
        <Skeleton variant="rectangular" width="100%" height={56} sx={{ borderRadius: 1 }} />
      </Grid>
    </Grid>
  </Paper>
);